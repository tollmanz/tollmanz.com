import { DateTime } from "luxon";
import { minify } from "html-minifier-terser";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import pluginRss from "@11ty/eleventy-plugin-rss";
import CleanCSS from "clean-css";
import markdownIt from "markdown-it";

export default function (eleventyConfig) {
  // Add plugins
  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPlugin(pluginRss);

  // Add a simple template engine for CSS files (just pass through content)
  eleventyConfig.addExtension("css", {
    outputFileExtension: "css",
    compile: function (inputContent) {
      return function () {
        return inputContent;
      };
    },
  });

  // HTML minification transform
  eleventyConfig.addTransform("htmlmin", async function (content) {
    if ((this.page.outputPath || "").endsWith(".html")) {
      let minified = await minify(content, {
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

  // CSS minification transform
  eleventyConfig.addTransform("cssmin", function (content) {
    if ((this.page.outputPath || "").endsWith(".css")) {
      const cleanCSS = new CleanCSS({
        level: 2,
        returnPromise: false,
      });

      try {
        const result = cleanCSS.minify(content);

        if (result.errors.length > 0) {
          console.error(
            `CSS minification errors for ${this.page.outputPath}:`,
            result.errors
          );
          return content;
        } else {
          if (result.warnings.length > 0) {
            console.warn(
              `CSS minification warnings for ${this.page.outputPath}:`,
              result.warnings
            );
          }

          return result.styles;
        }
      } catch (error) {
        console.error(
          `Error minifying CSS file ${this.page.outputPath}:`,
          error.message
        );
        return content;
      }
    }
    // If not a CSS output, return content as-is
    return content;
  });

  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/fonts");
  eleventyConfig.addPassthroughCopy("src/media");
  eleventyConfig.addPassthroughCopy("src/favicon.ico");

  // Create collections
  eleventyConfig.addCollection("posts", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/posts/*.md")
      .sort(function (a, b) {
        return b.date - a.date;
      });
  });

  eleventyConfig.addCollection("pages", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/pages/*.md");
  });

  // Date display filter
  eleventyConfig.addFilter("dateDisplay", function (dateObj) {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(
      "LLL dd, yyyy"
    );
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

  // Filter to detect if content has code blocks
  eleventyConfig.addFilter("hasCodeBlocks", function (content) {
    if (!content) return false;
    return /<pre[^>]*><code[^>]*class="[^"]*language-|<pre[^>]*class="[^"]*highlight/.test(
      content
    );
  });

  // Configure markdown
  let markdownItOptions = {
    html: true,
    breaks: false,
    linkify: true,
  };

  eleventyConfig.setLibrary("md", markdownIt(markdownItOptions));

  return {
    templateFormats: ["md", "njk", "html", "liquid", "css"],
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
}
