import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const builtRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, '_site');
const read = route => fs.readFileSync(path.join(builtRoot, route.replace(/^\//, ''), 'index.html'), 'utf8');
const visible = html => html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '');
const headingPaths = ['about', 'vocalists', 'formats', 'events', 'riders'].flatMap(page => [`/${page}/`, `/en/${page}/`]);
for (const route of headingPaths) {
  const html = read(route);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
  assert.ok(main, `${route}: main landmark is required`);
  const headings = [...main.matchAll(/<h([1-6])\b/g)].map(match => Number(match[1]));
  assert.equal(headings[0], 1, `${route}: main content starts with H1`);
  assert.equal(headings[1], 2, `${route}: first content section follows with H2`);
}
const title = html => html.match(/<title>([^<]+)<\/title>/)?.[1];
assert.notEqual(title(read('/repertoire/')), title(read('/assets/repertoire/')), 'Overview and standalone catalogue must have different titles');
assert.match(read('/repertoire/'), /<iframe[^>]+\/assets\/repertoire\/\?view=embedded/, 'Russian overview must expose the searchable catalogue');
assert.match(read('/en/repertoire/'), /<iframe[^>]+\/en\/repertoire\/catalog\/\?view=embedded/, 'English overview must embed the English catalogue');
assert.match(read('/formats/'), /href="\/promo\/erhu\/"/, 'Erhu must be reachable from a relevant section');
const erhu = read('/promo/erhu/');
assert.ok(erhu.indexOf('https://t.me/Luxurycover_ru') < erhu.indexOf('id="gallery"'), 'Erhu booking contact must appear before the media gallery');

const sitemap = fs.readFileSync(path.join(builtRoot, 'sitemap.xml'), 'utf8');
const videoSitemap = fs.readFileSync(path.join(builtRoot, 'video-sitemap.xml'), 'utf8');
const durations = { 'laz-coco-jambo': 'PT32S', 'volare-baskov': 'PT8S', perfect: 'PT163S' };
for (const [slug, duration] of Object.entries(durations)) {
  for (const prefix of ['', '/en']) {
    const route = `${prefix}/watch/${slug}/`;
    const html = read(route);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://luxuryband.ru${route}">`));
    assert.doesNotMatch(html, /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${route}: one H1`);
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert.equal((main.match(/<video\b/g) || []).length, 1, `${route}: one primary video`);
    assert.match(main, /<video[^>]*controls[^>]*poster="[^"]+"/);
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(match => {
      const data = JSON.parse(match[1]);
      return data['@graph'] || [data];
    });
    const video = schemas.find(item => item['@type'] === 'VideoObject');
    assert.ok(video?.contentUrl && video.thumbnailUrl && video.name && video.description, `${route}: video metadata must be populated`);
    assert.equal(video.duration, duration);
    assert.equal(video.uploadDate, undefined, `${route}: do not invent an undocumented upload date`);
    assert.ok(main.includes(video.contentUrl), `${route}: schema content URL must match the actual player`);
    assert.ok(sitemap.includes(`<loc>https://luxuryband.ru${route}</loc>`), `${route}: regular sitemap`);
    assert.ok(videoSitemap.includes(`<loc>https://luxuryband.ru${route}</loc>`), `${route}: video sitemap`);
    assert.ok(read(`${prefix}/about/`).includes(`href="${route}"`), `${route}: contextual incoming link`);
    assert.match(html, new RegExp(`hreflang="${prefix ? 'ru' : 'en'}" href="https://luxuryband.ru${prefix ? '' : '/en'}/watch/${slug}/"`));
    if (prefix) {
      assert.doesNotMatch(visible(html), /[\u0400-\u04ff]/, `${route}: English UI only`);
      assert.doesNotMatch(html, /href="https:\/\/t\.me\//);
      assert.match(html, /href="https:\/\/wa\.me\/971502776169"/);
    }
  }
}
assert.match(read('/embed/'), /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/, 'Technical embed must retain noindex');
console.log(JSON.stringify({ builtRoot, headingPages: 10, watchPages: 6, repertoireTitlesDistinct: true, erhuContactBeforeGallery: true, unknownUploadDatesNotInvented: true }));
