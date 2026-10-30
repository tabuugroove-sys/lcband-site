#!/usr/bin/env node
// Offline regression gate. Build first, then run: node tools/check-international-pages.mjs
// --json emits machine-readable findings; --site-dir PATH supports isolated fixtures.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://luxuryband.ru';
const CYRILLIC = /\p{Script=Cyrillic}|&[A-Za-z]+cy;/u;
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const BAD_IMAGES = ['live-lets-get-loud', 'live-dance-monkey', 'thematic-pop-dance-monkey', 'photos--hero-studio', '/photos/hero-studio.', 'concert-10k'];
const ASSET = /\.(?:avif|webp|png|jpe?g|gif|svg|ico|mp4|webm|mov|mp3|wav|pdf|zip|woff2?|ttf|css|js)$/i;

function decode(value) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, code) => {
    if (!code.startsWith('#')) return entities[code.toLowerCase()] ?? all;
    const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : all;
  });
}

function attributes(tag) {
  const result = {};
  const body = tag.replace(/^<\s*[^\s/>]+/, '').replace(/\/?\s*>$/, '');
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of body.matchAll(re)) result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  return result;
}

function parsedUrl(value, page) {
  try { return new URL(value, ORIGIN + page); } catch { return null; }
}

function assetUrl(value, page) {
  if (!/^(?:https?:\/\/|\/|\.\.?\/)/i.test(value)) return false;
  return ASSET.test(parsedUrl(value, page)?.pathname || '');
}

export function createPolicy(config, catalogue) {
  if (!Array.isArray(config.allowedVideos) || !config.allowedVideos.length || config.allowedVideos.some(key => typeof key !== 'string')) {
    throw new Error('internationalMedia.allowedVideos must be a nonempty array of reviewed keys');
  }
  const allowed = new Set(config.allowedVideos);
  const families = new Map();
  for (const [key, video] of Object.entries(catalogue.videos || {})) {
    families.set(key, key);
    if (video.family) families.set(video.family, key);
  }
  for (const key of allowed) families.set(key, key);
  return {
    allowed, families,
    overrides: config.posterOverrides || {},
    directSources: new Set((config.directSources || []).map(value => {
      const url = parsedUrl(value, '/');
      if (!url || url.origin !== ORIGIN) throw new Error(`Invalid reviewed direct source: ${value}`);
      return url.pathname;
    })),
  };
}

export function auditHtml(html, { page, policy }) {
  const issues = [];
  const seen = new Set();
  const stack = [];
  const counts = { videoKeys: 0, videoSources: 0, images: 0 };
  const lineStarts = [0];
  for (let i = 0; i < html.length; i++) if (html[i] === '\n') lineStarts.push(i + 1);
  function report(code, offset, message) {
    let lo = 0, hi = lineStarts.length;
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid; }
    const item = { page, line: lo + 1, code, message: message.replace(/\s+/g, ' ').trim().slice(0, 260) };
    const id = JSON.stringify(item);
    if (!seen.has(id)) { seen.add(id); issues.push(item); }
  }
  function text(value, offset, context, allowAssetUrl = false) {
    const decoded = decode(value);
    if (CYRILLIC.test(decoded) && !(allowAssetUrl && assetUrl(decoded, page))) report('cyrillic', offset, `${context}: ${decoded}`);
    if (/\b(?:NaN|Infinity)\b/.test(decoded) && stack.some(frame => /promo-package\.php(?:[?#]|$)/.test(frame.attrs.href || ''))) {
      report('download-size', offset, `Invalid generated package size: ${decoded}`);
    }
  }
  function video(value, offset, muted = false) {
    if (!value) return;
    counts.videoSources++;
    const url = parsedUrl(value, page);
    if (!url) return report('video-source', offset, `Invalid video URL: ${value}`);
    if (url.origin !== ORIGIN) return report('video-source', offset, `Unreviewed external video: ${value}`);
    // These shared decorative loops were reviewed without sound or lettering.
    if (muted && url.pathname.startsWith('/assets/hero/')) return;
    if (policy.directSources.has(url.pathname)) return;
    const family = path.posix.basename(url.pathname).replace(/\.(mp4|webm|mov)$/i, '').replace(/-(720|1080|1440|2160)$/, '');
    const key = policy.families.get(family);
    if (!key || !policy.allowed.has(key)) report('video-source', offset, `Unreviewed video source${key ? ` (${key})` : ''}: ${value}`);
  }
  function image(value, offset, owner) {
    if (!value) return;
    counts.images++;
    for (const pattern of BAD_IMAGES) if (value.includes(pattern)) report('image-language', offset, `Russian-lettered image pattern ${pattern}: ${value}`);
    const expected = value.includes('/assets/video/posters/') && policy.overrides[owner];
    if (expected && !value.includes(expected)) report('poster-override', offset, `${owner} must use reviewed poster ${expected}: ${value}`);
    // Catch the original poster even when it is outside its video card (e.g. preload/JSON-LD).
    for (const [key, slug] of Object.entries(policy.overrides)) {
      if (new RegExp(`/${key}\\.(?:jpe?g|png|webp|avif)(?:[?#,\\s]|$)`, 'i').test(value)) {
        report('poster-override', offset, `${key} must use reviewed poster ${slug}: ${value}`);
      }
    }
  }
  function link(value, attrs, offset) {
    if (!value || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(value)) return;
    const url = parsedUrl(value, page);
    if (!url || url.origin !== ORIGIN) return;
    if (/\.(mp4|webm|mov)$/i.test(url.pathname)) video(value, offset);
    if (url.pathname === '/embed/' || url.pathname === '/embed') {
      const expected = page.startsWith('/ae/') ? 'ar' : page.startsWith('/br/') ? 'pt-BR' : 'en';
      if (url.searchParams.get('lang') !== expected) report('player-language', offset, `Embed must carry lang=${expected}: ${value}`);
      if (url.searchParams.has('src')) video(url.searchParams.get('src'), offset);
      return;
    }
    // A deliberate language switch may leave /en/, but its label is still audited.
    if (!page.startsWith('/en/') || attrs.hreflang || ASSET.test(url.pathname)) return;
    if (url.pathname.endsWith('.php')) {
      if (url.pathname.endsWith('/promo-package.php') && url.searchParams.get('lang') !== 'en') report('download-language', offset, `Foreign package URL must carry lang=en: ${value}`);
      return;
    }
    if (!url.pathname.startsWith('/en/')) report('internal-language-link', offset, `English page links outside /en/: ${value}`);
  }
  function jsonLd(raw, offset) {
    let json;
    try { json = JSON.parse(raw); }
    catch (error) { report('json-ld', offset, error.message); return; }
    function inspect(value, key = '', trail = '$') {
      if (typeof value === 'string') {
        text(value, offset, `JSON-LD ${trail}`, true);
        if (/^(?:image|thumbnailUrl|logo)$/i.test(key)) image(value, offset);
        if (/^contentUrl$/i.test(key) && /\.(mp4|webm|mov)(?:[?#]|$)/i.test(value)) video(value, offset);
        if (/^embedUrl$/i.test(key)) link(value, {}, offset);
      } else if (Array.isArray(value)) value.forEach((entry, index) => inspect(entry, key, `${trail}[${index}]`));
      else if (value && typeof value === 'object') for (const [name, entry] of Object.entries(value)) inspect(entry, name, `${trail}.${name}`);
    }
    inspect(json);
  }
  // Tokenize quoted attributes and skip raw script/style text. Inline player dictionaries
  // intentionally contain RU translations and must not be confused with visible UI.
  const tags = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+(?:[^'">]|"[^"]*"|'[^']*')*)?\s*\/?>/g;
  let end = 0, match;
  while ((match = tags.exec(html))) {
    text(html.slice(end, match.index), end, 'text');
    const raw = match[0];
    end = tags.lastIndex;
    if (raw.startsWith('<!')) continue;
    const closing = /^<\//.test(raw);
    const tag = raw.match(/^<\/?([\w:-]+)/)[1].toLowerCase();
    if (closing) {
      const index = stack.map(entry => entry.tag).lastIndexOf(tag);
      if (index >= 0) stack.length = index;
      continue;
    }
    const attrs = attributes(raw);
    const owner = attrs['data-video'] || [...stack].reverse().find(entry => entry.attrs['data-video'])?.attrs['data-video'];
    const videoFrame = tag === 'video' ? { attrs } : [...stack].reverse().find(entry => entry.tag === 'video');
    const muted = videoFrame && Object.hasOwn(videoFrame.attrs, 'muted');
    for (const [key, value] of Object.entries(attrs)) {
      if (['alt', 'title', 'placeholder', 'label', 'data-title', 'data-caption', 'data-tooltip'].includes(key) || key.startsWith('aria-')) text(value, match.index, `<${tag}> ${key}`);
      if (key === 'content' && tag === 'meta') {
        text(value, match.index, `meta ${attrs.name || attrs.property || attrs['http-equiv'] || ''}`, true);
        if (/image/i.test(attrs.property || attrs.name || '')) image(value, match.index);
      }
      if (key === 'data-video') {
        counts.videoKeys++;
        if (!policy.allowed.has(value)) report('video-key', match.index, `Unreviewed data-video: ${value}`);
      }
      if (['data-video-src', 'video-src'].includes(key) || (['src', 'data-src'].includes(key) && (tag === 'video' || (tag === 'source' && videoFrame)))) video(value, match.index, muted);
      if (key === 'poster' || key === 'data-poster' || (['img', 'source', 'image'].includes(tag) && (!videoFrame || tag !== 'source') && ['src', 'srcset', 'data-src', 'data-srcset', 'href', 'xlink:href'].includes(key))) image(value, match.index, owner);
      if (key === 'style' || key === 'data-bg') for (const url of value.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)) image(url[1], match.index, owner);
    }
    if (tag === 'a' || tag === 'iframe') link(attrs.href || attrs.src, attrs, match.index);
    if (tag === 'script' || tag === 'style') {
      const close = new RegExp(`<\\/${tag}\\s*>`, 'ig');
      close.lastIndex = end;
      const closingTag = close.exec(html);
      const rawEnd = closingTag ? closingTag.index : html.length;
      if (tag === 'script' && attrs.type?.toLowerCase() === 'application/ld+json') jsonLd(html.slice(end, rawEnd), end);
      if (tag === 'style') for (const url of html.slice(end, rawEnd).matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)) image(url[1], end);
      end = closingTag ? close.lastIndex : html.length;
      tags.lastIndex = end;
    } else if (!VOID.has(tag) && !raw.endsWith('/>')) stack.push({ tag, attrs });
  }
  text(html.slice(end), end, 'text');
  return { issues, counts };
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : entry.isFile() && file.endsWith('.html') ? [file] : [];
  }).sort();
}

export function auditPackage(generated, { policy, catalogue }) {
  const issues = [];
  const report = message => issues.push({ page: '/promo-package-international.json', line: 1, code: 'international-package', message });
  if (!generated || typeof generated !== 'object' || Array.isArray(generated)) {
    report('Generated international package must be an object');
    return issues;
  }
  if (!Number.isSafeInteger(generated.timestamp)) report('Missing ZIP timestamp');
  const expectedFamilies = new Set([...policy.allowed].map(key => catalogue.videos?.[key]?.family).filter(Boolean));
  let originalStatic = null;
  for (const quality of ['original', '1080', '720']) {
    const variant = quality === 'original' ? generated : generated.variants?.[quality];
    const source = quality === 'original' ? catalogue.files : catalogue.variants?.[quality]?.files;
    if (!variant || !Array.isArray(variant.files) || !variant.files.length) {
      report(`Missing or empty ${quality} package files; check the Eleventy data loader`);
      continue;
    }
    if (!/^LCBAND-promo-international-[A-Za-z0-9-]+\.zip$/.test(variant.archiveName || '')) report(`${quality}: missing/invalid English archive filename`);
    const names = new Set();
    const families = new Set();
    const staticFiles = [];
    let expectedBytes = 98;
    let photos = 0, riders = 0;
    for (const file of variant.files) {
      if (!file || typeof file.name !== 'string' || !/^[\x20-\x7e]+$/.test(file.name) || file.name.startsWith('/') || file.name.includes('\\') || file.name.split('/').includes('..')) {
        report(`${quality}: missing, unsafe, or non-English ZIP entry name`);
        continue;
      }
      if (names.has(file.name)) report(`${quality}: duplicate ZIP entry ${file.name}`);
      names.add(file.name);
      if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{8}$/.test(file.crc32 || '') || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) report(`${quality}: invalid metadata/checksums for ${file.name}`);
      expectedBytes += file.bytes + 124 + 2 * Buffer.byteLength(file.name);
      const match = /^assets\/video\/mp4\/([a-z0-9-]+)-(\d+)\.mp4$/.exec(file.path || '');
      if (match) {
        const [, family, resolution] = match;
        if (!expectedFamilies.has(family)) report(`${quality}: unreviewed video family ${family}`);
        if (families.has(family)) report(`${quality}: duplicate video family ${family}`);
        families.add(family);
        if (quality !== 'original' && Number(resolution) > Number(quality)) report(`${quality}: higher-resolution video ${file.path}`);
        const verified = source?.find(entry => entry.path === file.path);
        if (!verified || ['bytes', 'crc32', 'sha256'].some(key => file[key] !== verified[key])) report(`${quality}: video differs from the verified source catalogue: ${file.path}`);
      } else {
        if (/^assets\/(?:hero|costumes)\/[a-z0-9-]+\.jpg$/.test(file.path || '')) photos++;
        else if (file.path === 'assets/riders/rider-international-7pc-en.pdf') riders++;
        else report(`${quality}: unreviewed static asset ${file.path}`);
        staticFiles.push([file.path, file.bytes, file.crc32, file.sha256]);
      }
    }
    for (const family of expectedFamilies) if (!families.has(family)) report(`${quality}: missing reviewed catalogue video ${family}`);
    if (photos !== 8 || riders !== 1) report(`${quality}: expected eight reviewed photos and one English rider, got ${photos} photos and ${riders} riders`);
    const staticSignature = JSON.stringify(staticFiles.sort((a, b) => a[0].localeCompare(b[0])));
    if (originalStatic === null) originalStatic = staticSignature;
    else if (staticSignature !== originalStatic) report(`${quality}: photos/documents differ from the original package`);
    if (!Number.isSafeInteger(variant.bytes) || variant.bytes !== expectedBytes) report(`${quality}: missing or inaccurate ZIP64 byte count`);
  }
  return issues;
}

export function auditSite(siteDir = path.join(ROOT, '_site'), root = ROOT) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'src/_data/internationalMedia.json'), 'utf8'));
  const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'media/lcband-promo-package.json'), 'utf8'));
  const policy = createPolicy(config, catalogue);
  const files = ['en', 'ae', 'br'].flatMap(locale => {
    const dir = path.join(siteDir, locale);
    if (!fs.existsSync(dir)) throw new Error(`Missing built locale ${dir}; build the site before running this audit`);
    const found = walk(dir);
    if (!found.length) throw new Error(`No HTML in ${dir}`);
    return found;
  });
  const issues = [];
  try {
    const generated = JSON.parse(fs.readFileSync(path.join(siteDir, 'promo-package-international.json'), 'utf8'));
    issues.push(...auditPackage(generated, { policy, catalogue }));
  } catch (error) {
    issues.push({ page: '/promo-package-international.json', line: 1, code: 'international-package', message: `Missing or invalid generated manifest: ${error.message}` });
  }
  const counts = { videoKeys: 0, videoSources: 0, images: 0 };
  for (const file of files) {
    const page = '/' + path.relative(siteDir, file).split(path.sep).join('/').replace(/index\.html$/, '');
    const result = auditHtml(fs.readFileSync(file, 'utf8'), { page, policy });
    issues.push(...result.issues);
    for (const key of Object.keys(counts)) counts[key] += result.counts[key];
  }
  return { pages: files.length, ...counts, errors: issues.length, issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const siteIndex = args.indexOf('--site-dir');
    if (siteIndex >= 0 && !args[siteIndex + 1]) throw new Error('--site-dir requires a path');
    const result = auditSite(siteIndex >= 0 ? path.resolve(args[siteIndex + 1]) : undefined);
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else {
      for (const issue of result.issues) console.error(`${issue.page}:${issue.line} [${issue.code}] ${issue.message}`);
      console.log(`International audit: ${result.pages} pages, ${result.videoKeys} video keys, ${result.videoSources} video sources, ${result.images} images; ${result.errors} errors.`);
    }
    process.exitCode = result.errors ? 1 : 0;
  } catch (error) { console.error(`International audit failed: ${error.message}`); process.exitCode = 1; }
}
