// Output each stylesheet at its content-hashed path so it can be cached
// immutable. The hash comes from the assets global data (the single source of
// truth shared with head.njk), keyed by file slug: main.css -> "main",
// syntax-highlighting.css -> "syntax-highlighting".
export default {
  eleventyComputed: {
    permalink: data => {
      const entry = data.assets.css[data.page.fileSlug];
      if (!entry) {
        throw new Error(
          `No fingerprint registered for ${data.page.inputPath}. Add "${data.page.fileSlug}" to the sources map in src/_data/assets.js.`
        );
      }
      return entry.url;
    },
  },
};
