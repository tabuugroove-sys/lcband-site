import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import createPackage from '../src/_data/internationalPromoPackage.js';

const catalogue = JSON.parse(fs.readFileSync(new URL('../media/lcband-promo-package.json', import.meta.url)));
const policy = JSON.parse(fs.readFileSync(new URL('../src/_data/internationalMedia.json', import.meta.url)));
const allowedFamilies = new Set(policy.allowedVideos.map(key => catalogue.videos[key]?.family).filter(Boolean));
const international = createPackage();
assert(international.files.some(file => file.path.endsWith('-2160.mp4')), '4K package has no 4K videos');
for (const [quality, variant] of [['original', international], ...Object.entries(international.variants)]) {
    const seen = new Set();
    assert.match(variant.archiveName, /^LCBAND-promo-international-[a-zA-Z0-9-]+\.zip$/);
    const originals = quality === 'original' ? catalogue.files : catalogue.variants[quality].files;
    for (const file of variant.files) {
        assert(!seen.has(file.name), `Duplicate ZIP name: ${file.name}`);
        seen.add(file.name);
        assert.match(file.name, /^[\x20-\x7e]+$/, 'Archive entry names must be English/ASCII');
        assert(!file.name.split('/').includes('..'), 'Unsafe ZIP name');
        if (file.path.endsWith('.mp4')) {
            const family = file.path.replace(/^assets\/video\/mp4\//, '').replace(/-\d+\.mp4$/, '');
            assert(allowedFamilies.has(family), `Unreviewed international video: ${family}`);
            const original = originals.find(entry => entry.path === file.path);
            assert(original, `MP4 not reused from verified master package: ${file.path}`);
            for (const field of ['bytes', 'crc32', 'sha256']) assert.equal(file[field], original[field]);
            if (quality !== 'original') assert(Number(file.path.match(/-(\d+)\.mp4$/)[1]) <= Number(quality));
        }
    }
    assert.equal(variant.files.filter(file => file.path.endsWith('.jpg')).length, 8);
    assert.deepEqual(variant.files.filter(file => file.path.endsWith('.pdf')).map(file => file.path), ['assets/riders/rider-international-7pc-en.pdf']);
    assert.equal(variant.bytes, 98 + variant.files.reduce((sum, file) => sum + file.bytes + 124 + 2 * Buffer.byteLength(file.name), 0));
}
// Verify generated checksums with PHP's independent CRC32 implementation.
for (const file of international.files.filter(file => !file.path.endsWith('.mp4'))) {
    const source = fileURLToPath(new URL('../src/' + file.path, import.meta.url));
    const buffer = fs.readFileSync(source);
    assert.equal(file.bytes, buffer.length);
    assert.equal(file.sha256, createHash('sha256').update(buffer).digest('hex'));
    assert.equal(file.crc32, execFileSync('php', ['-r', 'echo hash_file("crc32b", $argv[1]);', source], { encoding: 'utf8' }));
}
assert(international.variants['1080'].bytes < international.bytes);
assert(international.variants['720'].bytes < international.variants['1080'].bytes);
console.log(JSON.stringify({ ok: true, videos: international.files.length - 9, photos: 8, englishRiders: 1, bytes: international.bytes, fullHdBytes: international.variants['1080'].bytes }));
