<?php
declare(strict_types=1);

function lcb_zip_select(array $catalogue, mixed $quality): array
{
    if ($quality !== null && !in_array($quality, ['1080', '720'], true)) {
        throw new InvalidArgumentException('Unknown archive quality');
    }
    $selected = $quality === null ? $catalogue : ($catalogue['variants'][$quality] ?? null);
    if (!is_array($selected) || !isset($selected['files'], $selected['archiveName']) ||
        !preg_match('/\ALCBAND-promo(?:-[A-Za-z0-9-]+)?\.zip\z/', $selected['archiveName'])) {
        throw new RuntimeException('Requested archive is unavailable');
    }
    return [
        'files' => $selected['files'],
        'archiveName' => $selected['archiveName'],
        'timestamp' => $catalogue['timestamp'],
    ];
}

// Stored ZIP64 records, as defined by PKWARE APPNOTE 4.3. No archive is staged
// on disk. Open descriptors bind each request to one immutable media revision.
function lcb_zip_archive(array $entries, string $root, int $timestamp): array
{
    if (PHP_INT_SIZE < 8) throw new RuntimeException('ZIP64 requires 64-bit PHP');
    $root = realpath($root);
    if ($root === false) throw new RuntimeException('Missing archive root');
    $parts = [];
    $central = '';
    $offset = 0;
    $date = new DateTimeImmutable('@' . $timestamp);
    $dosTime = ((int)$date->format('G') << 11) | ((int)$date->format('i') << 5) | intdiv((int)$date->format('s'), 2);
    $dosDate = (((int)$date->format('Y') - 1980) << 9) | ((int)$date->format('n') << 5) | (int)$date->format('j');
    $seen = [];
    try {
        foreach ($entries as $entry) {
            $name = $entry['name'] ?? '';
            if (!is_string($name) || $name === '' || str_starts_with($name, '/') ||
                str_contains($name, "\0") || str_contains($name, '\\') ||
                in_array('..', explode('/', $name), true) || strlen($name) > 65535 ||
                !preg_match('//u', $name) || isset($seen[$name])) {
                throw new RuntimeException('Invalid or duplicate archive name');
            }
            $seen[$name] = true;
            $path = realpath($root . '/' . ($entry['path'] ?? ''));
            if ($path === false || !str_starts_with($path, $root . '/')) {
                throw new RuntimeException('Archive file is outside the public root');
            }
            $handle = fopen($path, 'rb');
            if ($handle === false) throw new RuntimeException('Archive file is not readable');
            $size = fstat($handle)['size'];
            if (!is_int($entry['bytes'] ?? null) || $size !== $entry['bytes'] ||
                !preg_match('/\A[0-9a-f]{8}\z/', $entry['crc32'] ?? '')) {
                fclose($handle);
                throw new RuntimeException('Archive file does not match its catalogue');
            }
            $crc = (int)hexdec($entry['crc32']);
            $extra = pack('vvPP', 1, 16, $size, $size);
            $header = pack('VvvvvvVVVvv', 0x04034b50, 45, 0x0800, 0, $dosTime,
                $dosDate, $crc, 0xffffffff, 0xffffffff, strlen($name), strlen($extra)) . $name . $extra;
            $parts[] = ['offset' => $offset, 'length' => strlen($header), 'bytes' => $header];
            $parts[] = ['offset' => $offset + strlen($header), 'length' => $size, 'handle' => $handle];
            $extra = pack('vvPPP', 1, 24, $size, $size, $offset);
            $central .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 45, 45, 0x0800, 0,
                $dosTime, $dosDate, $crc, 0xffffffff, 0xffffffff, strlen($name),
                strlen($extra), 0, 0, 0, 0, 0xffffffff) . $name . $extra;
            $offset += strlen($header) + $size;
        }
        $centralOffset = $offset;
        $parts[] = ['offset' => $offset, 'length' => strlen($central), 'bytes' => $central];
        $offset += strlen($central);
        $zip64Offset = $offset;
        $trailer = pack('VPvvVVPPPP', 0x06064b50, 44, 45, 45, 0, 0, count($entries),
            count($entries), strlen($central), $centralOffset);
        $trailer .= pack('VVPV', 0x07064b50, 0, $zip64Offset, 1);
        $trailer .= pack('VvvvvVVv', 0x06054b50, 0, 0, 0xffff, 0xffff, 0xffffffff, 0xffffffff, 0);
        $parts[] = ['offset' => $offset, 'length' => strlen($trailer), 'bytes' => $trailer];
        return ['parts' => $parts, 'length' => $offset + strlen($trailer)];
    } catch (Throwable $error) {
        lcb_zip_close(['parts' => $parts]);
        throw $error;
    }
}

function lcb_zip_close(array $archive): void
{
    foreach ($archive['parts'] as $part) {
        if (isset($part['handle']) && is_resource($part['handle'])) fclose($part['handle']);
    }
}

function lcb_zip_range(?string $range, int $length): array
{
    if ($range === null) return [0, $length - 1, false];
    if (!preg_match('/\Abytes=(\d*)-(\d*)\z/', trim($range), $match) ||
        ($match[1] === '' && $match[2] === '')) throw new RangeException('Invalid range');
    if ($match[1] === '') {
        $count = (int)$match[2];
        if ($count <= 0) throw new RangeException('Invalid suffix range');
        return [max(0, $length - $count), $length - 1, true];
    }
    $start = (int)$match[1];
    $end = $match[2] === '' ? $length - 1 : min((int)$match[2], $length - 1);
    if ($start >= $length || $end < $start) throw new RangeException('Unsatisfiable range');
    return [$start, $end, true];
}

function lcb_zip_emit(array $archive, int $start, int $end, callable $write): void
{
    foreach ($archive['parts'] as $part) {
        $last = $part['offset'] + $part['length'] - 1;
        if ($part['length'] === 0 || $last < $start || $part['offset'] > $end) continue;
        $skip = max(0, $start - $part['offset']);
        $remaining = min($last, $end) - ($part['offset'] + $skip) + 1;
        if (isset($part['bytes'])) {
            $write(substr($part['bytes'], $skip, $remaining));
            continue;
        }
        if (fseek($part['handle'], $skip) !== 0) throw new RuntimeException('Cannot seek media');
        while ($remaining > 0) {
            $bytes = fread($part['handle'], min(1048576, $remaining));
            if ($bytes === false || $bytes === '') throw new RuntimeException('Media ended early');
            $write($bytes);
            $remaining -= strlen($bytes);
        }
    }
}
