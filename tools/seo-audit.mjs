import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE_DIR = path.join(ROOT, "_site");
const OUT_DIR = path.join(ROOT, "output");
const SITE_URL = "https://luxuryband.ru";

function walk(dir, predicate = () => true) {
	const out = [];
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full, predicate));
		else if (predicate(full)) out.push(full);
	}
	return out;
}

function attr(tag, name) {
	const re = new RegExp(`${name}=["']([^"']*)["']`, "i");
	return tag.match(re)?.[1] || "";
}

function stripTags(html) {
	return html.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function localPathFromUrl(url, pageFile) {
	if (!url || url.startsWith("#") || url.startsWith("mailto:") || url.startsWith("tel:")) return null;
	if (/^https?:\/\//.test(url)) {
		if (!url.startsWith(SITE_URL)) return null;
		url = url.slice(SITE_URL.length) || "/";
	}
	if (url.startsWith("//")) return null;
	const clean = url.split("#")[0].split("?")[0];
	if (!clean) return null;
	if (clean.startsWith("/")) {
		const joined = path.join(SITE_DIR, clean);
		if (clean.endsWith("/")) return path.join(joined, "index.html");
		return joined;
	}
	return path.resolve(path.dirname(pageFile), clean);
}

function existsUrlTarget(url, pageFile) {
	const target = localPathFromUrl(url, pageFile);
	if (!target) return true;
	if (fs.existsSync(target)) return true;
	if (fs.existsSync(path.join(target, "index.html"))) return true;
	return false;
}

function parseJsonLd(html) {
	const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
	const parsed = [];
	const errors = [];
	for (const block of blocks) {
		const raw = block[1].trim();
		try {
			parsed.push(JSON.parse(raw));
		} catch (err) {
			errors.push(err.message);
		}
	}
	return { count: blocks.length, parsed, errors };
}

function textQuality(text) {
	const lower = text.toLowerCase();
	const commercialTerms = [
		"кавер", "группа", "свадь", "корпоратив", "мероприят", "живая музыка",
		"москва", "программа", "вокал", "саксофон", "юбилей"
	];
	const hits = commercialTerms.filter(term => lower.includes(term));
	return { words: text ? text.split(/\s+/).length : 0, terms: hits };
}

const htmlFiles = walk(SITE_DIR, f => f.endsWith(".html"));
const issues = [];
const pages = [];

for (const file of htmlFiles) {
	const rel = "/" + path.relative(SITE_DIR, file).replace(/\\/g, "/").replace(/index\.html$/, "");
	// Search-engine verification files are service artifacts, not pages:
	// they legitimately have no h1/canonical/meta and must not be audited.
	if (/^\/(google[0-9a-f]+|yandex_[0-9a-f]+)\.html$/.test(rel)) continue;
	if (rel.startsWith("/assets/repertoire/")) continue;
	const html = fs.readFileSync(file, "utf8");
	const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
	const desc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] || "";
	const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i)?.[1] || "";
	const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => stripTags(m[1]));
	const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => ({
		src: attr(m[0], "src"),
		alt: attr(m[0], "alt"),
		hasAlt: /\salt\s*=/i.test(m[0]),
	}));
	const links = [...html.matchAll(/<a\b[^>]*>/gi)].map(m => attr(m[0], "href")).filter(Boolean);
	const videos = [...html.matchAll(/data-video=["']([^"']+)["']/gi)].map(m => m[1]);
	const jsonLd = parseJsonLd(html);
	const visibleText = stripTags(html);
	const quality = textQuality(visibleText);

	if (title.length < 25 || title.length > 75) issues.push({ level: "warn", page: rel, issue: `title length ${title.length}` });
	if (desc.length < 90 || desc.length > 170) issues.push({ level: "warn", page: rel, issue: `description length ${desc.length}` });
	if (h1s.length !== 1) issues.push({ level: "error", page: rel, issue: `h1 count ${h1s.length}` });
	if (!canonical.startsWith(SITE_URL)) issues.push({ level: "error", page: rel, issue: `bad canonical ${canonical}` });
	if (!jsonLd.count) issues.push({ level: "warn", page: rel, issue: "missing JSON-LD" });
	for (const err of jsonLd.errors) issues.push({ level: "error", page: rel, issue: `invalid JSON-LD: ${err}` });
	for (const img of images) {
		// alt="" is valid HTML for decorative/tracking images (e.g. the Metrika
		// pixel); only a MISSING attribute or a short non-empty value is a defect.
		if (!img.hasAlt) issues.push({ level: "warn", page: rel, issue: `missing img alt: ${img.src}` });
		else if (img.alt && img.alt.length < 8) issues.push({ level: "warn", page: rel, issue: `weak img alt: ${img.src}` });
		if (!existsUrlTarget(img.src, file)) issues.push({ level: "error", page: rel, issue: `missing image: ${img.src}` });
	}
	for (const href of links) {
		if (!existsUrlTarget(href, file)) issues.push({ level: "error", page: rel, issue: `broken internal link: ${href}` });
	}
	for (const slug of videos) {
		// 720 is the baseline every player slug must have; higher qualities are
		// optional — the player degrades gracefully and hides unavailable ones.
		for (const q of ["720", "1080"]) {
			const mp4 = `/assets/video/mp4/${slug}-${q}.mp4`;
			if (!existsUrlTarget(mp4, file)) {
				issues.push({
					level: q === "720" ? "error" : "warn",
					page: rel,
					issue: `missing video file: ${mp4}`,
				});
			}
		}
	}
	pages.push({ page: rel, title, descriptionLength: desc.length, h1: h1s[0] || "", jsonLd: jsonLd.count, images: images.length, videos: [...new Set(videos)].length, words: quality.words, seoTerms: quality.terms });
}

for (const sitemap of ["sitemap.xml", "image-sitemap.xml", "video-sitemap.xml", "robots.txt"]) {
	if (!fs.existsSync(path.join(SITE_DIR, sitemap))) issues.push({ level: "error", page: "/", issue: `missing ${sitemap}` });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const summary = {
	generatedAt: new Date().toISOString(),
	pagesChecked: pages.length,
	errors: issues.filter(i => i.level === "error").length,
	warnings: issues.filter(i => i.level === "warn").length,
	pages,
	issues
};
fs.writeFileSync(path.join(OUT_DIR, "seo-report.json"), JSON.stringify(summary, null, 2));

const md = [
	"# SEO Audit",
	"",
	`Generated: ${summary.generatedAt}`,
	`Pages checked: ${summary.pagesChecked}`,
	`Errors: ${summary.errors}`,
	`Warnings: ${summary.warnings}`,
	"",
	"## Issues",
	"",
	...(issues.length ? issues.map(i => `- ${i.level.toUpperCase()} ${i.page}: ${i.issue}`) : ["No issues found."]),
	"",
	"## Pages",
	"",
	...pages.map(p => `- ${p.page}: ${p.words} words, ${p.images} images, ${p.videos} videos, JSON-LD ${p.jsonLd}, terms: ${p.seoTerms.join(", ") || "none"}`)
];
fs.writeFileSync(path.join(OUT_DIR, "seo-report.md"), md.join("\n") + "\n");

console.log(`SEO audit: ${summary.errors} error(s), ${summary.warnings} warning(s).`);
console.log(`Report: ${path.join(OUT_DIR, "seo-report.md")}`);
if (summary.errors) process.exit(1);
