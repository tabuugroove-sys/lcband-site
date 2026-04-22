export default function (eleventyConfig) {
	// Passthrough static assets untouched
	eleventyConfig.addPassthroughCopy("src/assets");
	eleventyConfig.addPassthroughCopy("src/styles.css");
	eleventyConfig.addPassthroughCopy("src/main.js");
	eleventyConfig.addPassthroughCopy("src/robots.txt");
	eleventyConfig.addPassthroughCopy({ "src/assets/repertoire": "assets/repertoire" });

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
		base = base || "https://tabuugroove-sys.github.io/lcband-site/";
		if (!url) return base;
		if (url.startsWith("http")) return url;
		return base.replace(/\/$/, "") + (url.startsWith("/") ? url : "/" + url);
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
