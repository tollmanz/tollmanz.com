const { DateTime } = require("luxon");
const { minify } = require("html-minifier-terser");
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

module.exports = function (eleventyConfig) {
  // Add syntax highlighting plugin
  eleventyConfig.addPlugin(syntaxHighlight);
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

  // Process and minify CSS files
  eleventyConfig.on("eleventy.before", async () => {
    const srcCssDir = "src/css";
    const outputCssDir = "public/css";

    // Ensure output directory exists
    if (!fs.existsSync(outputCssDir)) {
      fs.mkdirSync(outputCssDir, { recursive: true });
    }

    // Get all CSS files from src/css
    const cssFiles = fs
      .readdirSync(srcCssDir)
      .filter(file => file.endsWith(".css"));

    // Process each CSS file
    for (const file of cssFiles) {
      const inputPath = path.join(srcCssDir, file);
      const outputPath = path.join(outputCssDir, file);

      try {
        // Use clean-css-cli to minify the CSS
        execSync(`npx cleancss -o "${outputPath}" "${inputPath}"`, {
          stdio: "inherit",
        });
        console.log(`Minified CSS: ${inputPath} -> ${outputPath}`);
      } catch (error) {
        console.error(`Error minifying CSS file ${inputPath}:`, error.message);
        // Fallback: copy the file without minification
        fs.copyFileSync(inputPath, outputPath);
      }
    }
  });

  // Copy other static assets
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

  // Absolute URL filter for sitemap
  eleventyConfig.addFilter("absoluteUrl", function (url, base) {
    if (!url) return base;
    // Remove trailing slash from base if present
    const cleanBase = base.replace(/\/$/, "");
    // Ensure url starts with /
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;
    return `${cleanBase}${cleanUrl}`;
  });

  // Filter to detect if content has code blocks
  eleventyConfig.addFilter("hasCodeBlocks", function (content) {
    if (!content) return false;
    // Check for code blocks with language classes or highlight classes
    return /<pre[^>]*><code[^>]*class="[^"]*language-|<pre[^>]*class="[^"]*highlight/.test(
      content
    );
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
