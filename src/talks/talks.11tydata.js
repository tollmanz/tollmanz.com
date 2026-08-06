import path from "node:path";

// Directory data for every talk in src/talks. Each talk renders an individual
// page through the talk layout. The permalink keeps the source filename, which
// already carries the date and so disambiguates the several talks that share a
// title (e.g. "HTTP/2 and You" given at two events).
export default {
  layout: "talk.njk",
  eleventyComputed: {
    permalink: data =>
      `/speaking/${path.basename(data.page.inputPath, ".md")}/`,
  },
};
