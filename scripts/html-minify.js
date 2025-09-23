const fs = require("fs");

const { glob } = require("glob");
const { minify } = require("html-minifier-terser");

(async () => {
  try {
    const files = await glob("./public/**/*.html");

    for (const file of files) {
      const contents = fs.readFileSync(file).toString();
      const minified = await minify(contents, {
        collapseWhitespace: true,
        minifyJS: true,
        minifyCSS: true,
        removeAttributeQuotes: true,
        removeComments: true,
      });
      fs.writeFileSync(file, minified);
    }
  } catch (e) {
    console.error(e);
  }
})();
