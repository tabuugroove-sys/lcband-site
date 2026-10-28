import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run after the real Eleventy build; do not substitute a standalone template render.
const root = fileURLToPath(new URL('../../', import.meta.url));
const builtPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, '_site/en/repertoire/catalog/index.html');
const source = fs.readFileSync(path.join(root, 'src/assets/repertoire/index.html'), 'utf8');
const built = fs.readFileSync(builtPath, 'utf8');
const numbers = html => [...html.matchAll(/<li value="(\d+)"/g)].map(match => Number(match[1]));
const sourceNumbers = numbers(source);
const builtNumbers = numbers(built);

assert.equal(sourceNumbers.length, 420, 'Update the fixture count deliberately if the repertoire changes');
assert.equal(builtNumbers.length, 420, 'Real Eleventy output must contain all 420 songs');
assert.deepEqual(builtNumbers, sourceNumbers, 'Real built catalogue must contain every source song, in order');
assert.equal(new Set(builtNumbers).size, 420, 'Built catalogue must not duplicate song IDs');
assert.equal((built.match(/<section class="song-section"/g) || []).length, 15, 'All categories must be rendered');
assert.match(built, /Browse 420 song entries/, 'Eleventy must resolve the catalogue data in page copy');
assert.match(built, /\.wrap\s*\{\s*width:min\(1080px/, 'Shared catalogue styles must be resolved');
assert.match(built, /Holidayboy — Pozhary/, 'First source song must be present in Latin spelling');
assert.match(built, /Bruno mars : Runaway baby/, 'Last source song must be present');
assert.match(built, /https:\/\/wa\.me\/971502776169/, 'Booking link must use the configured WhatsApp number');
assert.doesNotMatch(built, /[\u0400-\u04ff]/, 'No Cyrillic may leak into the built English catalogue');
assert.doesNotMatch(built, /(?:href|src)="[^\"]*(?:t\.me\/|assets\/repertoire\/)/, 'English catalogue must not send visitors to Telegram or the Russian catalogue');

console.log(JSON.stringify({ builtPath, songs: builtNumbers.length, categories: 15, stylesPresent: true, noCyrillic: true, sourceOrderPreserved: true }));
