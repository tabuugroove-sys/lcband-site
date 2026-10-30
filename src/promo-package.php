<?php
declare(strict_types=1);
require __DIR__ . '/lib/promo-zip.php';

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}
$archive = null;
$language = is_string($_GET['lang'] ?? null) ? $_GET['lang'] : 'ru';
$errors = [
    'ru' => ['invalid' => 'Неизвестное качество архива.', 'unavailable' => 'Промопакет обновляется. Попробуйте скачать его через минуту.'],
    'en' => ['invalid' => 'Unknown archive quality.', 'unavailable' => 'The promo package is being updated. Please try again in a minute.'],
    'ar' => ['invalid' => 'جودة الأرشيف غير معروفة.', 'unavailable' => 'يجري تحديث الحزمة الترويجية. يرجى المحاولة مجددًا بعد دقيقة.'],
    'pt-BR' => ['invalid' => 'Qualidade de arquivo desconhecida.', 'unavailable' => 'O pacote promocional está sendo atualizado. Tente novamente em um minuto.'],
];
$errorCopy = $errors[$language] ?? $errors['en'];
try {
    $catalogueName = $language === 'ru' ? '/promo-package.json' : '/promo-package-international.json';
    $raw = file_get_contents(__DIR__ . $catalogueName);
    $catalogue = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    $selected = lcb_zip_select($catalogue, $_GET['quality'] ?? null);
    foreach ($selected['files'] as $entry) {
        if (!preg_match('~\Aassets/(?:(?:video/mp4|promo/lcband|photos)/[a-z0-9][a-z0-9.-]*|(?:hero|costumes)/[a-z0-9][a-z0-9-]*\.jpg|riders/rider-international-7pc-en\.pdf)\z~', $entry['path'])) {
            throw new RuntimeException('Invalid public media path');
        }
    }
    $etag = '"' . hash('sha256', json_encode($selected, JSON_THROW_ON_ERROR)) . '"';
    if (!isset($_SERVER['HTTP_RANGE']) && ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
        header('ETag: ' . $etag);
        http_response_code(304);
        exit;
    }
    $archive = lcb_zip_archive($selected['files'], __DIR__, $selected['timestamp']);
    $requestedRange = $_SERVER['HTTP_RANGE'] ?? null;
    if (isset($_SERVER['HTTP_IF_RANGE']) && $_SERVER['HTTP_IF_RANGE'] !== $etag) $requestedRange = null;
    try {
        [$start, $end, $partial] = lcb_zip_range($requestedRange, $archive['length']);
    } catch (RangeException $error) {
        header('Content-Range: bytes */' . $archive['length']);
        http_response_code(416);
        exit;
    }
    if ($partial) {
        http_response_code(206);
        header("Content-Range: bytes $start-$end/" . $archive['length']);
    }
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $selected['archiveName'] . '"');
    header('Content-Length: ' . ($end - $start + 1));
    header('Accept-Ranges: bytes');
    header('ETag: ' . $etag);
    header('Cache-Control: public, max-age=0, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    header('X-Accel-Buffering: no');
    if ($_SERVER['REQUEST_METHOD'] === 'HEAD') exit;
    set_time_limit(0);
    ini_set('zlib.output_compression', '0');
    while (ob_get_level() > 0) ob_end_clean();
    lcb_zip_emit($archive, $start, $end, static function (string $bytes): void {
        if (connection_aborted()) throw new RuntimeException('Download disconnected');
        echo $bytes;
        flush();
    });
} catch (InvalidArgumentException $error) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') echo $errorCopy['invalid'];
} catch (Throwable $error) {
    if (!headers_sent()) {
        http_response_code(503);
        header('Content-Type: text/plain; charset=utf-8');
        header('Retry-After: 60');
        if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') echo $errorCopy['unavailable'];
    }
} finally {
    if ($archive !== null) lcb_zip_close($archive);
}
