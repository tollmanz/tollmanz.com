import CleanCSS from "clean-css";

// Eleventy transform: minify .css output. clean-css reports failures via
// result.errors as well as by throwing; both paths log a warning and fall back
// to the original content so a single bad file never breaks the build.
export default function cssmin(content) {
  if (!(this.page.outputPath || "").endsWith(".css")) {
    return content;
  }

  const cleanCSS = new CleanCSS({ level: 2, returnPromise: false });

  try {
    const result = cleanCSS.minify(content);

    if (result.errors.length > 0) {
      console.warn(
        `CSS minification failed for ${this.page.outputPath}; serving unminified content:`,
        result.errors
      );
      return content;
    }

    if (result.warnings.length > 0) {
      console.warn(
        `CSS minification warnings for ${this.page.outputPath}:`,
        result.warnings
      );
    }

    return result.styles;
  } catch (error) {
    console.warn(
      `CSS minification failed for ${this.page.outputPath}; serving unminified content:`,
      error.message
    );
    return content;
  }
}
