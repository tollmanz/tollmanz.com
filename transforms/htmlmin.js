import { minify } from "html-minifier-terser";

// html-minifier-terser options. minifyJS/minifyCSS also compress inline
// <script>/<style> blocks that templates emit.
const MINIFY_OPTIONS = {
  collapseWhitespace: true,
  minifyJS: true,
  minifyCSS: true,
  removeAttributeQuotes: true,
  removeComments: true,
};

// Eleventy transform: minify .html output. On failure, log a warning and fall
// back to the original content so a single bad page never breaks the build.
export default async function htmlmin(content) {
  if (!(this.page.outputPath || "").endsWith(".html")) {
    return content;
  }

  try {
    return await minify(content, MINIFY_OPTIONS);
  } catch (error) {
    console.warn(
      `HTML minification failed for ${this.page.outputPath}; serving unminified content:`,
      error.message
    );
    return content;
  }
}
