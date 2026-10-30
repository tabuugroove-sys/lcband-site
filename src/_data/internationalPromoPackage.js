import fs from 'node:fs';
import { createHash } from 'node:crypto';

const sourceRoot = new URL('../', import.meta.url);
const catalogueFile = new URL('../../media/lcband-promo-package.json', import.meta.url);
const policyFile = new URL('./internationalMedia.json', import.meta.url);
// Reviewed group/stage photographs without lettering; reused from the public site.
const photos = [
    ['assets/hero/hero-red.jpg', 'Photos/01-Red-stage-outfits.jpg'],
    ['assets/hero/hero-bw.jpg', 'Photos/02-Black-and-white-stage-outfits.jpg'],
    ['assets/hero/hero-gold.jpg', 'Photos/03-Gold-stage-outfits.jpg'],
    ['assets/hero/hero-white.jpg', 'Photos/04-White-stage-outfits.jpg'],
    ['assets/costumes/blue.jpg', 'Photos/05-Blue-live-performance.jpg'],
    ['assets/costumes/dark-green-group.jpg', 'Photos/06-Emerald-live-performance.jpg'],
    ['assets/costumes/pink.jpg', 'Photos/07-Pink-live-performance.jpg'],
    ['assets/costumes/all-black.jpg', 'Photos/08-Black-live-performance.jpg'],
];

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

function localEntry(relative, name) {
    const buffer = fs.readFileSync(new URL(relative, sourceRoot));
    return { path: relative, name, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), crc32: crc32(buffer) };
}

// Same stored ZIP64 length as src/lib/promo-zip.php, including UTF-8 filenames.
function archiveBytes(files) {
    return files.reduce((sum, file) => sum + file.bytes + 124 + 2 * Buffer.byteLength(file.name), 98);
}

export default function () {
    const catalogue = JSON.parse(fs.readFileSync(catalogueFile, 'utf8'));
    const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
    if (!Array.isArray(policy.allowedVideos) || !policy.allowedVideos.length) throw new Error('No reviewed international video keys');
    // Only reuse files already included in the master package: no transcoding,
    // extra server copies, or on-disk ZIP archives are needed.
    const keys = [...new Set(policy.allowedVideos)].filter(key => catalogue.videos[key]);
    if (!keys.length) throw new Error('No reviewed videos exist in the promo catalogue');
    const staticFiles = [
        ...photos.map(([relative, name]) => localEntry(relative, name)),
        localEntry('assets/riders/rider-international-7pc-en.pdf', 'Documents/Technical-rider-7-performers-English.pdf'),
    ];
    function select(sourceFiles, label) {
        const files = keys.map((key, index) => {
            const family = catalogue.videos[key].family;
            const matches = sourceFiles.filter(file => file.path.startsWith(`assets/video/mp4/${family}-`) && /-\d+\.mp4$/.test(file.path));
            if (matches.length !== 1) throw new Error(`${label}: expected one catalogued file for ${key}, got ${matches.length}`);
            const file = matches[0];
            const quality = file.path.match(/-(\d+)\.mp4$/)[1];
            if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[0-9a-f]{64}$/.test(file.sha256) || !/^[0-9a-f]{8}$/.test(file.crc32)) {
                throw new Error(`${label}: missing verified size/checksum for ${key}`);
            }
            if (label !== 'original' && Number(quality) > Number(label)) throw new Error(`${label}: higher-resolution video leaked into package: ${key}`);
            return { ...file, name: `Videos/${String(index + 1).padStart(2, '0')}-${key}-${quality === '2160' ? '4K' : quality + 'p'}.mp4` };
        });
        return [...files, ...staticFiles];
    }
    const files = select(catalogue.files, 'original');
    const variants = {};
    for (const quality of ['1080', '720']) {
        const sourceFiles = catalogue.variants?.[quality]?.files;
        if (!sourceFiles) throw new Error(`Missing verified ${quality} source catalogue`);
        const variantFiles = select(sourceFiles, quality);
        variants[quality] = { archiveName: `LCBAND-promo-international-${quality}p.zip`, files: variantFiles, bytes: archiveBytes(variantFiles) };
    }
    const revision = createHash('sha256').update(JSON.stringify({ files, variants })).digest('hex').slice(0, 16);
    return {
        version: `international-${revision}`,
        timestamp: catalogue.timestamp,
        archiveName: 'LCBAND-promo-international-4K.zip',
        files,
        bytes: archiveBytes(files),
        variants,
    };
}
