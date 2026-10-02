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
header('Content-Disposition: attachment; filename="' . $filename . '"');
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
