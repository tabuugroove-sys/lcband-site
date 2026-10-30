import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export default function (eleventyConfig) {
	const pathPrefix = process.env.PATHPREFIX || "/lcband-site/";
	const promoCatalogueFile = new URL('./media/lcband-promo-package.json', import.meta.url);
	const promoCatalogue = fs.existsSync(promoCatalogueFile) ? JSON.parse(fs.readFileSync(promoCatalogueFile, 'utf8')) : null;
	const internationalMedia = JSON.parse(fs.readFileSync(new URL('./src/_data/internationalMedia.json', import.meta.url), 'utf8'));
	const internationalVideos = new Set(internationalMedia.allowedVideos);
	eleventyConfig.addFilter('internationalVideo', key => internationalVideos.has(key));
	// Shared galleries must opt in to reviewed audio and artwork for foreign pages.
	eleventyConfig.addFilter('internationalVideos', videos => (videos || []).filter(video => internationalVideos.has(video.slug)));
	eleventyConfig.addFilter('internationalPoster', (poster, key) => {
		const replacement = internationalMedia.posterOverrides[key];
		if (!replacement) return poster;
		return poster?.includes('/') ? `assets/video/posters/${replacement}.jpg` : replacement;
	});
	// Full performance MP4 files live on Sprinthost and are catalogued in
	// media/manifest.json. Short silent background loops (under 1.6 MB each) live
	// in assets/hero and are versioned with the site for reproducible deployment.
	const passthroughAssetDirectories = [
		"costumes",
		"docs",
		"erhu",
		"hero",
		"icons",
		"jazz-irina",
		"leo-sax",
		"photos",
		"riders",
		"stereo-sax",
		"video/posters",
		"vocalists",
	];
	for (const assetDirectory of passthroughAssetDirectories) {
		eleventyConfig.addPassthroughCopy({
			[`src/assets/${assetDirectory}`]: `assets/${assetDirectory}`,
		});
	}
	// The catalogue HTML is rendered as a template. Copying the whole directory
	// as well creates two writers for index.html and makes transforms race.
	eleventyConfig.addPassthroughCopy("src/assets/repertoire/repertoire.pdf");
	eleventyConfig.addPassthroughCopy("src/assets/repertoire/repertoire-2024.docx");
	eleventyConfig.addPassthroughCopy("src/assets/repertoire/images");
	eleventyConfig.addPassthroughCopy({ "src/assets/favicon.svg": "assets/favicon.svg" });
	eleventyConfig.addPassthroughCopy("src/assets/blog-list.css");
	eleventyConfig.addPassthroughCopy("src/styles.css");
	eleventyConfig.addPassthroughCopy("src/stat-icons.css");
	eleventyConfig.addPassthroughCopy("src/stat-icons.js");
	eleventyConfig.addPassthroughCopy("src/main.js");
	eleventyConfig.addPassthroughCopy("src/analytics.js");
	eleventyConfig.addPassthroughCopy("src/video-quality.js");
	eleventyConfig.addPassthroughCopy("src/video-share.js");
	eleventyConfig.addPassthroughCopy("src/video-share.css");
	eleventyConfig.addPassthroughCopy("src/download.php");
	eleventyConfig.addPassthroughCopy("src/promo-package.php");
	eleventyConfig.addPassthroughCopy("src/promo-downloads.css");
	eleventyConfig.addPassthroughCopy("src/lib/promo-zip.php");
	eleventyConfig.addPassthroughCopy({ "media/lcband-promo-package.json": "promo-package.json" });
	eleventyConfig.addTransform("videoSharing", function (content) {
		if (!this.page.outputPath?.endsWith('.html')) return content;
		// Native players and existing embeds use the same revision as the ZIP.
		content = content.replace(/assets\/video\/mp4\/([a-z0-9-]+)-(480|720|1080|2160)\.mp4(?:\?v=[a-z0-9]+)?/g, (url, slug, quality) => {
			const video = promoCatalogue?.videos?.[slug];
			return video ? `assets/video/mp4/${video.family}-${quality}.mp4` : url;
		});
		content = content.replace(/assets\/photos\/wall\/costumes--[a-z0-9-]+-(300|520)\.webp(?!\?)/g, '$&?v=20261014canon');
		// Refresh only the old concert photo and its responsive wall crops.
		content = content.replace(/assets\/photos\/(?:concert-light\.jpg|wall\/photos--concert-light-(?:300|520)\.webp)(?:\?v=[a-z0-9]+)?/g, (url) => `${url.split('?')[0]}?v=20261030filming`);
		content = content.replace('</head>', `<link rel="stylesheet" href="${pathPrefix}video-share.css?v=2"><script src="${pathPrefix}locale.js?v=1" defer></script><script src="${pathPrefix}video-quality.js?v=4" defer></script></head>`);
		if (this.page.url === '/embed/') return content.replace('</head>', `<script src="${pathPrefix}promo-media.js?v=20261030perfect" defer></script></head>`);
		return content.replace(/live-icon-(720|1080)\.mp4(?!\?)/g, 'live-icon-$1.mp4?v=20261002cut6')
			.replace('</body>', `<script src="${pathPrefix}video-share.js?v=7" defer></script></body>`);
	});
	eleventyConfig.addPassthroughCopy("src/robots.txt");
	eleventyConfig.addPassthroughCopy("src/eabb0705846202e830565870a38f394c.txt"); // IndexNow key — must survive at site root
	eleventyConfig.addPassthroughCopy("src/.htaccess");

	// Search-engine verification files — keep exact filename at site root
	eleventyConfig.addPassthroughCopy("src/yandex_aee9a8b3d1cfc306.html");
	eleventyConfig.addPassthroughCopy("src/google9d309273640d9fd4.html");
	eleventyConfig.ignores.add("src/yandex_*.html");
	eleventyConfig.ignores.add("src/google*.html");

	// Watch these for dev rebuild
	eleventyConfig.addWatchTarget("src/styles.css");
	eleventyConfig.addWatchTarget("src/main.js");

	// Custom filters
	eleventyConfig.addFilter("date", (dateObj, format = "YYYY-MM-DD") => {
		const d = new Date(dateObj || new Date());
		return d.toISOString().split("T")[0];
	});

	// Canonical absolute URL helper
	eleventyConfig.addFilter("absoluteUrl", function (url, base) {
		base = base || "https://luxuryband.ru/";
		if (!url) return base;
		if (url.startsWith("http")) return url;
		return base.replace(/\/$/, "") + (url.startsWith("/") ? url : "/" + url);
	});

	eleventyConfig.addFilter("xmlDate", () => {
		return new Date().toISOString().split("T")[0];
	});

	// Intrinsic image dimensions: every local <img> gets width/height at build
	// time so the browser reserves space (CLS) and image search gets real sizes.
	// Reads JPEG/PNG/WebP headers directly — no dependencies.
	const imageSizeCache = new Map();
	function readImageSize(file) {
		if (imageSizeCache.has(file)) return imageSizeCache.get(file);
		let size = null;
		try {
			const buf = fs.readFileSync(file);
			if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
				size = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
			} else if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
				const four = buf.toString("ascii", 12, 16);
				if (four === "VP8X") size = { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
				else if (four === "VP8 ") size = { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
				else if (four === "VP8L") { const n = buf.readUInt32LE(21); size = { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
			} else if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
				let off = 2;
				while (off + 9 < buf.length) {
					if (buf[off] !== 0xff) break;
					const marker = buf[off + 1];
					const len = buf.readUInt16BE(off + 2);
					if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
						size = { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
						break;
					}
					off += 2 + len;
				}
			}
		} catch { /* missing file: leave untouched, the SEO audit reports it */ }
		imageSizeCache.set(file, size);
		return size;
	}
	eleventyConfig.addTransform("imgDimensions", function (content) {
		if (!this.page.outputPath || !this.page.outputPath.endsWith(".html")) return content;
		return content.replace(/<img\b[^>]*>/g, (tag) => {
			if (/\bwidth=/.test(tag) && /\bheight=/.test(tag)) return tag;
			const src = (tag.match(/\ssrc="([^"]+)"/) || [])[1];
			if (!src || !src.startsWith("/assets/")) return tag;
			const file = path.join("src", src.split("?")[0]);
			const size = readImageSize(file);
			if (!size || !size.w || !size.h) return tag;
			return tag.replace(/\s*\/?>$/, ` width="${size.w}" height="${size.h}">`);
		});
	});

	// Keep original JPEG links for the lightbox; cards select a versioned WebP.
	const responsivePhotos = JSON.parse(fs.readFileSync(new URL('./media/responsive-photos.json', import.meta.url), 'utf8'));
	for (const [url, photo] of Object.entries(responsivePhotos)) {
		const source = path.join('src', url);
		if (!fs.existsSync(source) || createHash('sha256').update(fs.readFileSync(source)).digest('hex') !== photo.sourceSha256) {
			console.warn(`Responsive photo changed: ${url}; serving the original. Run python3 tools/build-responsive-photos.py to refresh WebP variants.`);
			delete responsivePhotos[url];
		}
	}
	eleventyConfig.addTransform("responsivePhotos", function (content) {
		if (!this.page.outputPath?.endsWith('.html')) return content;
		const renderedPhotos = new Map();
		const rendered = content.replace(/<img\b[^>]*>/g, (tag) => {
			const src = (tag.match(/\ssrc="([^"]+)"/) || [])[1];
			const assetPath = src?.split('?')[0].replace(/^.*\/assets\//, '/assets/');
			const photo = responsivePhotos[assetPath];
			if (!photo || /\bsrcset=/.test(tag)) return tag;
			const layout = (tag.match(/\sdata-photo-layout="([^"]+)"/) || [])[1];
			const ratio = photo.width / photo.height;
			let sizes = '100vw';
			if (layout === 'costume') {
				const cover = Math.max(1, ratio);
				sizes = `(max-width: 734px) ${50 * cover}vw, ${100 / 3 * cover}vw`;
			} else if (layout === 'live' || layout === 'live-wide') {
				const desktopWidth = layout === 'live-wide' ? 1120 : 552;
				const desktopFluid = layout === 'live-wide' ? 'calc(100vw - 80px)' : 'calc(50vw - 48px)';
				sizes = `(max-width: 739px) max(calc(100vw - 44px), ${Math.ceil(320 * ratio)}px), (max-width: 900px) max(calc(100vw - 80px), ${Math.ceil(320 * ratio)}px), (min-width: 1200px) ${Math.ceil(Math.max(desktopWidth, 380 * ratio))}px, max(${desktopFluid}, ${Math.ceil(380 * ratio)}px)`;
			}
			const srcset = photo.variants.map(item => `${pathPrefix}${item.url.slice(1)} ${item.width}w`).join(', ');
			renderedPhotos.set(assetPath, {srcset, sizes: (tag.match(/\ssizes="([^"]+)"/) || [])[1] || sizes});
			tag = tag.replace(/\sdata-photo-layout="[^"]+"/, '');
			const sizeAttr = /\bsizes=/.test(tag) ? '' : ` sizes="${sizes}"`;
			const decodingAttr = /\bdecoding=/.test(tag) ? '' : ' decoding="async"';
			return tag.replace(/\s*\/?>$/, ` srcset="${srcset}"${sizeAttr}${decodingAttr}>`);
		});
		// Match preloads to the responsive image; omit an unused photo preload.
		return rendered.replace(/<link\b[^>]*>/g, (tag) => {
			if (!/\brel="preload"/.test(tag) || !/\bas="image"/.test(tag)) return tag;
			const href = (tag.match(/\shref="([^"]+)"/) || [])[1];
			const assetPath = href?.split('?')[0].replace(/^.*\/assets\//, '/assets/');
			if (!responsivePhotos[assetPath]) return tag;
			const image = renderedPhotos.get(assetPath);
			if (!image) return '';
			const fallback = responsivePhotos[assetPath].variants.at(-1).url;
			return tag.replace(/\shref="[^"]+"/, ` href="${pathPrefix}${fallback.slice(1)}"`)
				.replace(/\s*\/?>$/, ` imagesrcset="${image.srcset}" imagesizes="${image.sizes}" type="image/webp">`);
		});
	});

	return {
		dir: {
			input: "src",
			output: "_site",
			includes: "_includes",
			data: "_data"
		},
		pathPrefix,
		templateFormats: ["njk", "md", "html"],
		htmlTemplateEngine: "njk",
		markdownTemplateEngine: "njk"
	};
}
