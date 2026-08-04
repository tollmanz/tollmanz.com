import { talkProblems, validateCollection } from "./validate.js";
import { talkBacklinks } from "./backlinks.js";
import site from "../src/_data/site.js";

const POSTS_GLOB = "src/posts/*.md";
const PAGES_GLOB = "src/pages/*.md";
const TALKS_GLOB = "src/talks/*.md";

// Run a collection builder, degrading to `fallback` with a clear error rather
// than crashing the whole build when something unexpected throws.
function buildCollection(label, fallback, build) {
  try {
    return build();
  } catch (error) {
    console.error(`[collections] Failed to build "${label}": ${error.message}`);
    return fallback;
  }
}

// Register all content collections onto the Eleventy config. Scope is metadata
// and validation only: nothing here creates new URLs or surfaces internal
// front-matter fields. See docs/collections.md.
export default function registerCollections(eleventyConfig) {
  eleventyConfig.addCollection("posts", collectionApi =>
    buildCollection("posts", [], () =>
      validateCollection(
        collectionApi
          .getFilteredByGlob(POSTS_GLOB)
          .sort((a, b) => b.date - a.date),
        "posts"
      )
    )
  );

  eleventyConfig.addCollection("pages", collectionApi =>
    buildCollection("pages", [], () =>
      validateCollection(collectionApi.getFilteredByGlob(PAGES_GLOB), "pages")
    )
  );

  // Speaking engagements. Each item also renders its own page through
  // src/talks/talks.11tydata.js; the collection drives the speaking index,
  // the facet counts, and related-talk ranking.
  eleventyConfig.addCollection("talks", collectionApi =>
    buildCollection("talks", [], () =>
      validateCollection(
        collectionApi
          .getFilteredByGlob(TALKS_GLOB)
          .sort((a, b) => b.date - a.date),
        "talks",
        talkProblems
      )
    )
  );

  // Reverse links: { postUrl: [talk, ...] } for every post a talk cites as its
  // wrap-up writing, so post.njk can point back at the talk without the link
  // being maintained on both sides. Keys only existing post URLs; creates none.
  eleventyConfig.addCollection("talkBacklinks", collectionApi =>
    buildCollection("talkBacklinks", {}, () =>
      talkBacklinks(
        collectionApi
          .getFilteredByGlob(TALKS_GLOB)
          .sort((a, b) => b.date - a.date),
        site.url
      )
    )
  );

  // Lightweight metadata templates can consume without re-counting collections,
  // e.g. {{ collections.collectionMeta.posts }}. Counts only.
  eleventyConfig.addCollection("collectionMeta", collectionApi =>
    buildCollection("collectionMeta", { posts: 0, pages: 0, talks: 0 }, () => ({
      posts: collectionApi.getFilteredByGlob(POSTS_GLOB).length,
      pages: collectionApi.getFilteredByGlob(PAGES_GLOB).length,
      talks: collectionApi.getFilteredByGlob(TALKS_GLOB).length,
    }))
  );
}
