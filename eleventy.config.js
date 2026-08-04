import { DateTime } from "luxon";
import fs from "node:fs";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import pluginRss from "@11ty/eleventy-plugin-rss";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import markdownIt from "markdown-it";
import registerFilters from "./filters/index.js";
import registerCollections from "./collections/index.js";
import registerTransforms from "./transforms/index.js";

// ---------------------------------------------------------------------------
// Talk enrichment
//
// Individual talk pages and the speaking index derive their metadata (type,
// topics, link/video/slide providers, categorized sources, related talks)
// from the same source frontmatter, so the two views never drift and no hand
// maintained taxonomy fields are required.
// ---------------------------------------------------------------------------

// Topic taxonomy in priority order. The first rule a talk matches is its
// primary topic and drives the accent color on cards and pages. Matching runs
// against the title first; only talks whose title names no topic fall back to
// the abstract, which keeps tagging precise while still covering every talk.
const TOPIC_RULES = [
  {
    slug: "https-tls",
    label: "HTTPS & TLS",
    re: /https|tls|\bssl\b|put an .s. on it/i,
  },
  { slug: "http2", label: "HTTP/2", re: /http\s*\/?\s*2\b/i },
  { slug: "caching", label: "Caching", re: /cach/i },
  { slug: "git", label: "Git", re: /\bgit\b/i },
  {
    slug: "performance",
    label: "Performance",
    re: /performanc|speed|\bfast\b|page[ -]?load/i,
  },
  {
    slug: "javascript",
    label: "JavaScript",
    re: /backbone|\bnode\b|react|javascript|ecmascript/i,
  },
  {
    slug: "infrastructure",
    label: "Infrastructure",
    re: /infrastructure|cowboy|stack|scal|\bedge\b/i,
  },
  {
    slug: "wordpress",
    label: "WordPress",
    re: /wordpress|object cache|theme|core function|function for that|partial page|templat|doing.it.wrong/i,
  },
];

function talkTopics(data) {
  if (!data) return [];
  const title = String(data.title || "");
  const byTitle = TOPIC_RULES.filter(r => r.re.test(title));
  const matched = byTitle.length
    ? byTitle
    : TOPIC_RULES.filter(r => r.re.test(`${title} ${data.description || ""}`));
  return matched.map(({ slug, label }) => ({ slug, label }));
}

function talkType(title) {
  const t = String(title || "");
  if (/keynote/i.test(t)) return { slug: "keynote", label: "Keynote" };
  if (/\bpanel\b/i.test(t)) return { slug: "panel", label: "Panel" };
  if (/workshop/i.test(t)) return { slug: "workshop", label: "Workshop" };
  return { slug: "talk", label: "Talk" };
}

// Drop the type marker from the visible title; it is shown as a badge instead.
function displayTitle(title) {
  return String(title || "")
    .replace(/\s*\((?:keynote|workshop|panel)\)\s*$/i, "")
    .replace(/^\s*(?:keynote|workshop|panel)\s*:\s*/i, "")
    .trim();
}

// Collapse a title to a comparison key so the same talk given at several
// events is recognized as one series when ranking related talks.
function seriesKey(title) {
  return displayTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function videoProvider(url) {
  const u = String(url || "");
  if (/wordpress\.tv/i.test(u)) return "WordPress.tv";
  if (/youtube\.com|youtu\.be/i.test(u)) return "YouTube";
  if (/vimeo\.com/i.test(u)) return "Vimeo";
  if (/oreilly\.com/i.test(u)) return "O'Reilly";
  return "Video";
}

function isLocalPdf(url) {
  return /^\/.*\.pdf$/i.test(String(url || ""));
}

function slidesProvider(url) {
  const u = String(url || "");
  if (/speakerdeck\.com/i.test(u)) return "Speaker Deck";
  if (isLocalPdf(u)) return "PDF";
  if (/github\.io|github\.com/i.test(u)) return "GitHub";
  return "Slides";
}

// Split the free-form sources list into the sections the talk page renders:
// code repos, on-site reading, and external coverage.
function categorizeSources(sources) {
  const code = [];
  const reading = [];
  const elsewhere = [];
  for (const s of sources || []) {
    if (!s || !s.url) continue;
    if (s.label === "Code" || /github\.com/i.test(s.url)) {
      code.push(s);
    } else if (s.url.startsWith("/")) {
      reading.push(s);
    } else {
      elsewhere.push(s);
    }
  }
  return { code, reading, elsewhere };
}

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

  // Content collections (posts, pages, collectionMeta), extracted into the
  // collections/ directory with their front-matter validation. See
  // docs/collections.md.
  registerCollections(eleventyConfig);

  // Custom filters (dateDisplay, head, hasCodeBlocks), extracted into the
  // filters/ directory and grouped by concern. See docs/filters.md.
  registerFilters(eleventyConfig);

  eleventyConfig.addCollection("talks", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/talks/*.md")
      .sort(function (a, b) {
        return b.date - a.date;
      });
  });

  // Machine-readable date for <time datetime="..."> attributes
  eleventyConfig.addFilter("htmlDateString", function (dateObj) {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy-LL-dd");
  });

  // Build the event-type filter facets from the talks collection: an ordered
  // list of { slug, label, count } used to render filter chips and rules.
  const EVENT_LABELS = {
    wordcamp: "WordCamp",
    phpworld: "php[world]",
    loopconf: "LoopConf",
    midwestphp: "MidwestPHP",
    velocity: "Velocity",
    altitude: "Fastly Altitude",
    xbiz: "XBIZ",
    meetup: "Meetup",
    wpsessions: "WPSessions",
    other: "Other",
  };
  eleventyConfig.addFilter("eventFacets", function (talks) {
    const counts = {};
    for (const t of talks) {
      const e = t.data.eventType || "other";
      counts[e] = (counts[e] || 0) + 1;
    }
    return Object.keys(counts)
      .map(function (slug) {
        return {
          slug: slug,
          label: EVENT_LABELS[slug] || slug,
          count: counts[slug],
        };
      })
      .sort(function (a, b) {
        return b.count - a.count || a.label.localeCompare(b.label);
      });
  });

  // Year-only date for the big numeral on talk cards.
  eleventyConfig.addFilter("year", function (dateObj) {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy");
  });

  // Month + day; the year is rendered separately on the index.
  eleventyConfig.addFilter("monthDay", function (dateObj) {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("LLL dd");
  });

  // Expose the talk enrichment helpers to templates.
  eleventyConfig.addFilter("displayTitle", displayTitle);
  eleventyConfig.addFilter("talkType", talkType);
  eleventyConfig.addFilter("talkTopics", talkTopics);
  eleventyConfig.addFilter("videoProvider", videoProvider);
  eleventyConfig.addFilter("slidesProvider", slidesProvider);
  eleventyConfig.addFilter("isLocalPdf", isLocalPdf);
  eleventyConfig.addFilter("categorizeSources", categorizeSources);

  // Topic filter facets: an ordered list of { slug, label, count } mirroring
  // eventFacets, counting every talk that carries each topic.
  eleventyConfig.addFilter("topicFacets", function (talks) {
    const counts = {};
    for (const t of talks) {
      for (const top of talkTopics(t.data)) {
        if (!counts[top.slug]) {
          counts[top.slug] = { slug: top.slug, label: top.label, count: 0 };
        }
        counts[top.slug].count++;
      }
    }
    return TOPIC_RULES.map(r => counts[r.slug]).filter(Boolean);
  });

  // Headline numbers for the speaking index hero.
  eleventyConfig.addFilter("speakingStats", function (talks) {
    const years = talks.map(t => t.date.getUTCFullYear());
    return {
      count: talks.length,
      firstYear: years.length ? Math.min(...years) : null,
      lastYear: years.length ? Math.max(...years) : null,
      withVideo: talks.filter(t => t.data.video).length,
      withSlides: talks.filter(t => t.data.slides).length,
    };
  });

  // Rank related talks: the same talk given at another event scores highest,
  // then talks that share the most topics. Returns up to `limit` collection
  // items, newest first within a score. Current talk identified by inputPath.
  eleventyConfig.addFilter("relatedTalks", function (talks, inputPath, limit) {
    const max = limit || 4;
    const current = talks.find(t => t.inputPath === inputPath);
    if (!current) return [];
    const curTopics = talkTopics(current.data).map(x => x.slug);
    const curSeries = seriesKey(current.data.title);
    return talks
      .filter(t => t.inputPath !== inputPath)
      .map(t => {
        const shared = talkTopics(t.data).filter(x =>
          curTopics.includes(x.slug)
        ).length;
        const sameSeries = seriesKey(t.data.title) === curSeries ? 1 : 0;
        return { t, score: sameSeries * 100 + shared };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || b.t.date - a.t.date)
      .slice(0, max)
      .map(x => x.t);
  });

  // Split a description string into paragraphs on blank lines
  eleventyConfig.addFilter("paragraphs", function (str) {
    if (!str) return [];
    return String(str)
      .split(/\n{2,}/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  });

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
