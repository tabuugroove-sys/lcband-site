<?php
declare(strict_types=1);
require __DIR__ . '/../src/lib/promo-zip.php';

function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$root = sys_get_temp_dir() . '/lcb-zip-test-' . bin2hex(random_bytes(6));
mkdir($root);
try {
    file_put_contents($root . '/one.bin', 'first payload');
    file_put_contents($root . '/two.bin', "\0\1binary\xff\n");
    $entries = [];
    foreach (['one.bin' => 'Промо/Видео/Первое.mp4', 'two.bin' => 'Промо/Фото/Второе.jpg'] as $path => $name) {
        $entries[] = ['path' => $path, 'name' => $name, 'bytes' => filesize($root . '/' . $path), 'crc32' => hash_file('crc32b', $root . '/' . $path)];
    }
    $archive = lcb_zip_archive($entries, $root, 1791979200);
    $all = '';
    lcb_zip_emit($archive, 0, $archive['length'] - 1, static function ($bytes) use (&$all) { $all .= $bytes; });
    check(strlen($all) === $archive['length'], 'Wrong full archive length');
    foreach ([[0, 0], [24, 130], [strlen($all) - 100, strlen($all) - 1], [55, 60]] as [$start, $end]) {
        $actual = '';
        lcb_zip_emit($archive, $start, $end, static function ($bytes) use (&$actual) { $actual .= $bytes; });
        check($actual === substr($all, $start, $end - $start + 1), 'Byte range does not match archive');
    }
    check(lcb_zip_range('bytes=-20', 100) === [80, 99, true], 'Suffix range');
    check(lcb_zip_range('bytes=20-', 100) === [20, 99, true], 'Open range');
    foreach (['bytes=100-', 'bytes=9-2', 'bytes=-0', 'bytes=0-2,5-7', 'bytes=-', 'nonsense'] as $invalid) {
        try { lcb_zip_range($invalid, 100); throw new RuntimeException('Invalid range accepted'); }
        catch (RangeException $expected) {}
    }
    foreach (['../secret', '/absolute', "bad\0name", 'a/../../b'] as $invalid) {
        try {
            lcb_zip_archive([array_merge($entries[0], ['name' => $invalid])], $root, 1791979200);
            throw new RuntimeException('Invalid entry name accepted');
        } catch (RuntimeException $expected) { check(!str_contains($expected->getMessage(), 'accepted'), $expected->getMessage()); }
    }
    // Sparse input crosses both ZIP32 file-size and central-directory offsets.
    $large = fopen($root . '/large.bin', 'w+b');
    check(ftruncate($large, 0x100000010), 'Cannot create sparse fixture');
    fseek($large, 0x10000000f); fwrite($large, 'Z'); fclose($large);
    $huge = lcb_zip_archive([['name' => 'large.bin', 'path' => 'large.bin', 'bytes' => 0x100000010, 'crc32' => '00000000']], $root, 1791979200);
    check($huge['length'] > 0x100000000, 'ZIP64 length was truncated');
    $marker = '';
    $position = $huge['parts'][1]['offset'] + 0x10000000f;
    lcb_zip_emit($huge, $position, $position, static function ($bytes) use (&$marker) { $marker .= $bytes; });
    check($marker === 'Z', 'Seeking above 4 GiB failed');
    lcb_zip_close($huge);
    lcb_zip_close($archive);
    echo json_encode(['ok' => true, 'zip_base64' => base64_encode($all)], JSON_UNESCAPED_UNICODE) . "\n";
} finally {
    foreach (glob($root . '/*') as $path) unlink($path);
    rmdir($root);
}
