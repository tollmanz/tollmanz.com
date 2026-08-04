import fs from "node:fs";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import pluginRss from "@11ty/eleventy-plugin-rss";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import markdownIt from "markdown-it";
import registerFilters from "./filters/index.js";
import registerCollections from "./collections/index.js";
import registerTransforms from "./transforms/index.js";

export default function (eleventyConfig) {
  // Add plugins
  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPlugin(pluginRss);

  // Build-time responsive images: rewrite the bare <img> that markdown-it emits
  // into <picture>/srcset with width/height. Sources are PNGs under src/media;
  // emitted derivatives land in public/img with hashed, immutable filenames.
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ["avif", "webp", "jpeg"],
    widths: [780, 1560],
    htmlOptions: {
      imgAttributes: {
        loading: "lazy",
        decoding: "async",
        sizes: "(max-width: 800px) calc(100vw - 30px), 780px",
      },
    },
  });

  // Add a simple template engine for CSS files (just pass through content)
  eleventyConfig.addExtension("css", {
    outputFileExtension: "css",
    compile: function (inputContent) {
      return function () {
        return inputContent;
      };
    },
  });

  // Minification transforms (see transforms/ and docs/transforms.md). Only run
  // for production builds (`npm run build`), not the dev server: skipping
  // minification in serve/watch keeps rebuilds fast and output readable.
  registerTransforms(eleventyConfig);

  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/fonts");
  // Rasters under src/media/images are consumed by eleventyImageTransformPlugin
  // and emitted to public/img, so copy only the PDFs to avoid shipping the
  // unreferenced originals next to public/img.
  eleventyConfig.addPassthroughCopy("src/media/pdf");
  eleventyConfig.addPassthroughCopy("src/favicon.ico");

  // RUM bundle, built by `npm run build:js` into build/js when RUM is enabled.
  // Only copy it when present, so the default (RUM_MODE=off) build stays clean.
  if (fs.existsSync("build/js")) {
    eleventyConfig.addPassthroughCopy({ "build/js": "js" });
  }

  // Content collections (posts, pages, talks, collectionMeta), extracted into
  // the collections/ directory with their front-matter validation. See
  // docs/collections.md.
  registerCollections(eleventyConfig);

  // Custom filters (date formatting, array slicing, content inspection, and
  // the speaking section), extracted into the filters/ directory and grouped
  // by concern. See docs/filters.md.
  registerFilters(eleventyConfig);

  // Configure markdown
  let markdownItOptions = {
    html: true,
    breaks: false,
    linkify: true,
  };

  eleventyConfig.setLibrary("md", markdownIt(markdownItOptions));

  return {
    templateFormats: ["md", "njk", "html", "css"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "public",
    },
  };
}
