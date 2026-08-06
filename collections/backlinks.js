// Reverse index from posts back to the talks they accompany.
//
// A talk declares its wrap-up article once, as a `sources` entry with
// kind "writing". Posts record nothing about talks. Inverting that single
// declaration at build time lets a post link back to its talk without a second
// list to keep in sync. See docs/collections.md.

const WRITING_KIND = "writing";

// Normalize a talk source URL to the path form Eleventy uses for `page.url`,
// so the two compare directly. Relative URLs resolve against `siteUrl`;
// anything landing on another origin returns null, which keeps off-site
// writing links out of the map. A path whose last segment looks like a file
// (e.g. /feed.xml) keeps its exact shape; every other path gets a trailing
// slash, matching Eleventy's directory-style output.
export function writingPath(url, siteUrl) {
  if (typeof url !== "string" || url.trim() === "") {
    return null;
  }
  const base = typeof siteUrl === "string" && siteUrl ? siteUrl : "https://x/";
  let parsed;
  let origin;
  try {
    parsed = new URL(url.trim(), base);
    origin = new URL(base).origin;
  } catch {
    return null;
  }
  if (parsed.origin !== origin) {
    return null;
  }
  const path = parsed.pathname;
  const last = path.slice(path.lastIndexOf("/") + 1);
  return last.includes(".") || path.endsWith("/") ? path : `${path}/`;
}

// Build { postUrl: [talk, ...] } from the talks collection. Input order is
// preserved, so talks come out in whatever order the collection was sorted in,
// and a talk listing the same article twice is only recorded once.
export function talkBacklinks(talks, siteUrl) {
  const map = {};
  for (const talk of talks || []) {
    if (!talk?.url) {
      continue;
    }
    for (const source of talk?.data?.sources || []) {
      if (!source || source.kind !== WRITING_KIND) {
        continue;
      }
      const path = writingPath(source.url, siteUrl);
      if (!path) {
        continue;
      }
      const entries = (map[path] ||= []);
      if (!entries.includes(talk)) {
        entries.push(talk);
      }
    }
  }
  return map;
}
