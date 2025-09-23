const { DateTime } = require("luxon");
const { minify } = require("html-minifier-terser");

module.exports = function (eleventyConfig) {
  // HTML minification transform
  eleventyConfig.addTransform("htmlmin", function (content) {
    if ((this.page.outputPath || "").endsWith(".html")) {
      let minified = minify(content, {
        collapseWhitespace: true,
        minifyJS: true,
        minifyCSS: true,
        removeAttributeQuotes: true,
        removeComments: true,
      });
      return minified;
    }
    // If not an HTML output, return content as-is
    return content;
  });

  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/fonts");
  eleventyConfig.addPassthroughCopy("src/media");
  eleventyConfig.addPassthroughCopy("src/favicon.ico");

  // Create collections
  eleventyConfig.addCollection("posts", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/posts/*.md")
      .sort(function (a, b) {
        return b.date - a.date; // Sort by date descending
      });
  });

  eleventyConfig.addCollection("pages", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/pages/*.md");
  });

  // Date filters
  eleventyConfig.addFilter("dateDisplay", function (dateObj) {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(
      "LLL dd, yyyy"
    );
  });

  eleventyConfig.addFilter("dateISO", function (dateObj) {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toISO();
  });

  // Permalink filter for clean URLs
  eleventyConfig.addFilter("slug", function (str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
      .trim("-"); // Remove leading/trailing hyphens
  });

  // Head filter for RSS feed
  eleventyConfig.addFilter("head", function (array, n) {
    if (!Array.isArray(array) || array.length === 0) {
      return [];
    }
    if (n < 0) {
      return array.slice(n);
    }
    return array.slice(0, n);
  });

  // HTML to absolute URLs filter for RSS feed
  eleventyConfig.addFilter("htmlToAbsoluteUrls", function (htmlContent, base) {
    if (!htmlContent) return htmlContent;
    return htmlContent.replace(/href="\/([^"]*)/g, `href="${base}/$1`);
  });

  // Configure markdown
  let markdownIt = require("markdown-it");
  let markdownItOptions = {
    html: true,
    breaks: false,
    linkify: true,
  };

  eleventyConfig.setLibrary("md", markdownIt(markdownItOptions));

  return {
    templateFormats: ["md", "njk", "html", "liquid"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "public",
    },
  };
};
