<?php
// Stream only existing public video files, with an explicit download disposition.
$filename = $_GET['file'] ?? '';
if (!is_string($filename) || !preg_match('/\A[a-zA-Z0-9_-]+\.mp4\z/', $filename)) {
    http_response_code(400);
    exit('Invalid video filename');
}
$file = __DIR__ . '/assets/video/mp4/' . $filename;
if (!is_file($file) || !is_readable($file)) {
    http_response_code(404);
    exit('Video not found');
}
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}
header('Content-Type: video/mp4');
$displayName = $filename;
$catalogue = json_decode(@file_get_contents(__DIR__ . '/promo-package.json') ?: '{}', true);
foreach (($catalogue['files'] ?? []) as $entry) {
    if (basename($entry['path']) === $filename) { $displayName = basename($entry['name']); break; }
}
if ($displayName === $filename) {
    foreach (($catalogue['videos'] ?? []) as $video) {
        if (!preg_match('/\A' . preg_quote($video['family'], '/') . '-(720|1080|2160)\.mp4\z/', $filename, $quality)) continue;
        foreach ($catalogue['files'] as $entry) {
            if ($entry['path'] !== $video['original']) continue;
            $displayName = pathinfo(basename($entry['name']), PATHINFO_FILENAME) . ' — ' . $quality[1] . 'p.mp4';
            break 2;
        }
    }
}
header('Content-Disposition: attachment; filename="' . $filename . '"; filename*=UTF-8\'\'' . rawurlencode($displayName));
header('Content-Length: ' . filesize($file));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, no-store');
if ($_SERVER['REQUEST_METHOD'] === 'HEAD') exit;
// Keep memory bounded even for 4K files; never build a full-file browser Blob.
set_time_limit(0);
while (ob_get_level() > 0) ob_end_clean();
$stream = fopen($file, 'rb');
if ($stream === false) { http_response_code(500); exit; }
fpassthru($stream);
fclose($stream);
