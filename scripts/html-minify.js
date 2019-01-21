const fs = require('fs');

const glob = require('glob');
const { minify } = require('html-minifier');

(async() => {
  try {
    const files = await new Promise((resolve, reject) => {
      glob('./public/**/*.html', (err, files) => {
        if (err) {
          return reject(err);
        }

        return resolve(files);
      });
    });

    files.map(file => {
      const contents = fs.readFileSync(file).toString();
      const minified = minify(contents, {
        collapseWhitespace: true,
        minifyJS: true,
        minifyCSS: true,
        removeAttributeQuotes: true,
        removeComments: true,
      });
      fs.writeFileSync(file, minified);
    });
  } catch(e) {
    console.error(e);
  }
})();

