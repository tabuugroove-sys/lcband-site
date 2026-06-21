export default function (eleventyConfig) {
	// Passthrough static assets untouched
	eleventyConfig.addPassthroughCopy("src/assets");
	eleventyConfig.addPassthroughCopy("src/styles.css");
	eleventyConfig.addPassthroughCopy("src/main.js");
	eleventyConfig.addPassthroughCopy("src/robots.txt");
	eleventyConfig.addPassthroughCopy({ "src/assets/repertoire": "assets/repertoire" });

	// Search-engine verification files — keep exact filename at site root
	eleventyConfig.addPassthroughCopy("src/yandex_aee9a8b3d1cfc306.html");
	eleventyConfig.ignores.add("src/yandex_*.html");

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
