import fs from "node:fs";
import path from "node:path";

export default function (eleventyConfig) {
	// Git tracks code and lightweight assets. MP4 files live on Sprinthost and
	// are catalogued in media/manifest.json, so they must never enter _site or
	// a GitHub Actions artifact.
	const passthroughAssetDirectories = [
		"costumes",
		"docs",
		"hero",
		"leo-sax",
		"photos",
		"repertoire",
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
	eleventyConfig.addPassthroughCopy({ "src/assets/favicon.svg": "assets/favicon.svg" });
	eleventyConfig.addPassthroughCopy("src/styles.css");
	eleventyConfig.addPassthroughCopy("src/main.js");
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

	return {
		dir: {
			input: "src",
			output: "_site",
			includes: "_includes",
			data: "_data"
		},
		pathPrefix: process.env.PATHPREFIX || "/lcband-site/",
		templateFormats: ["njk", "md", "html"],
		htmlTemplateEngine: "njk",
		markdownTemplateEngine: "njk"
	};
}
