import htmlmin from "./htmlmin.js";
import cssmin from "./cssmin.js";

// Eleventy sets ELEVENTY_RUN_MODE to "build" for `eleventy`, and to "serve" or
// "watch" for `eleventy --serve`. Minification only earns its cost on the
// production build: skipping it in serve/watch keeps rebuilds fast and the
// served output readable.
export function shouldMinify(env = process.env) {
  return env.ELEVENTY_RUN_MODE === "build";
}

// Register the output transforms onto the Eleventy config. One transform per
// sibling module: HTML (htmlmin.js) and CSS (cssmin.js). See docs/transforms.md.
export default function registerTransforms(eleventyConfig) {
  if (!shouldMinify()) {
    return;
  }

  eleventyConfig.addTransform("htmlmin", htmlmin);
  eleventyConfig.addTransform("cssmin", cssmin);
}
