import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categorizeSources,
  displayTitle,
  eventFacets,
  isLocalPdf,
  relatedTalks,
  slidesProvider,
  speakingStats,
  talkTopics,
  talkType,
  topicFacets,
  videoProvider,
} from "../../filters/talks.js";

function talk(inputPath, data, date) {
  return { inputPath, data, date: date ?? new Date(data.date ?? "2015-01-01") };
}

test("talkTopics returns taxonomy-ordered slugs and labels", () => {
  assert.deepEqual(talkTopics({ title: "HTTP/2 and You" }), [
    { slug: "http2", label: "HTTP/2" },
  ]);
});

test("talkTopics falls back to the description when the title names none", () => {
  const topics = talkTopics({
    title: "When Websites Stop Being Polite",
    description: "An in-depth look at performance metrics in WordPress Core.",
  });
  assert.deepEqual(
    topics.map(topic => topic.slug),
    ["performance", "wordpress"]
  );
});

test("talkTopics returns an empty list for missing data", () => {
  assert.deepEqual(talkTopics(null), []);
  assert.deepEqual(talkTopics({}), []);
});

test("talkType reads the format marker out of the title", () => {
  assert.equal(talkType("A Talk (Keynote)").slug, "keynote");
  assert.equal(talkType("Panel: Something").slug, "panel");
  assert.equal(talkType("Workshop: Something").slug, "workshop");
  assert.equal(talkType("Scaling WordPress").slug, "talk");
  assert.equal(talkType(undefined).slug, "talk");
});

test("displayTitle strips the format marker from either end", () => {
  assert.equal(displayTitle("Getting Real (Keynote)"), "Getting Real");
  assert.equal(displayTitle("Panel: Moving to HTTPS"), "Moving to HTTPS");
  assert.equal(displayTitle("Scaling WordPress"), "Scaling WordPress");
});

test("videoProvider names the known hosts and falls back", () => {
  assert.equal(videoProvider("https://wordpress.tv/x/"), "WordPress.tv");
  assert.equal(videoProvider("https://youtu.be/abc"), "YouTube");
  assert.equal(videoProvider("https://vimeo.com/1"), "Vimeo");
  assert.equal(videoProvider("https://www.oreilly.com/videos/x"), "O'Reilly");
  assert.equal(videoProvider("https://example.com/x"), "Video");
});

test("slidesProvider distinguishes hosted decks from local PDFs", () => {
  assert.equal(slidesProvider("https://speakerdeck.com/x"), "Speaker Deck");
  assert.equal(slidesProvider("https://tollmanz.github.io/x/"), "GitHub");
  assert.equal(slidesProvider("/media/pdf/WCSEA-2013.pdf"), "PDF");
  assert.equal(slidesProvider("https://example.com/deck"), "Slides");
});

test("isLocalPdf accepts only site-relative PDF paths", () => {
  assert.equal(isLocalPdf("/media/pdf/a.pdf"), true);
  assert.equal(isLocalPdf("https://example.com/a.pdf"), false);
  assert.equal(isLocalPdf("/media/pdf/a.html"), false);
});

test("categorizeSources splits code, on-site reading, and coverage", () => {
  const groups = categorizeSources([
    { label: "Code", url: "https://github.com/tollmanz/x" },
    { label: "Blog post", url: "/grokking-the-wp-object-cache/" },
    { label: "Session", url: "https://example.com/session" },
    { label: "Broken", url: "" },
    null,
  ]);
  assert.deepEqual(
    groups.code.map(source => source.label),
    ["Code"]
  );
  assert.deepEqual(
    groups.reading.map(source => source.label),
    ["Blog post"]
  );
  assert.deepEqual(
    groups.elsewhere.map(source => source.label),
    ["Session"]
  );
});

test("topicFacets counts every topic and keeps taxonomy order", () => {
  const facets = topicFacets([
    talk("a.md", { title: "HTTPS Is Coming" }),
    talk("b.md", { title: "Caching for Coders" }),
    talk("c.md", { title: "Understanding HTTPS and TLS" }),
  ]);
  assert.deepEqual(facets, [
    { slug: "https-tls", label: "HTTPS & TLS", count: 2 },
    { slug: "caching", label: "Caching", count: 1 },
  ]);
});

test("eventFacets labels known event types and sorts by count", () => {
  const facets = eventFacets([
    talk("a.md", { eventType: "wordcamp" }),
    talk("b.md", { eventType: "wordcamp" }),
    talk("c.md", { eventType: "phpworld" }),
    talk("d.md", {}),
  ]);
  assert.deepEqual(facets, [
    { slug: "wordcamp", label: "WordCamp", count: 2 },
    { slug: "other", label: "Other", count: 1 },
    { slug: "phpworld", label: "php[world]", count: 1 },
  ]);
});

test("speakingStats summarizes the collection", () => {
  const stats = speakingStats([
    talk("a.md", { video: "https://wordpress.tv/x/" }, new Date("2012-03-24")),
    talk(
      "b.md",
      { slides: "https://speakerdeck.com/x" },
      new Date("2019-11-02")
    ),
    talk("c.md", {}, new Date("2015-07-18")),
  ]);
  assert.deepEqual(stats, {
    count: 3,
    firstYear: 2012,
    lastYear: 2019,
    withVideo: 1,
    withSlides: 1,
  });
});

test("speakingStats reports null years for an empty collection", () => {
  assert.deepEqual(speakingStats([]), {
    count: 0,
    firstYear: null,
    lastYear: null,
    withVideo: 0,
    withSlides: 0,
  });
});

test("relatedTalks ranks the same talk at another event first", () => {
  const talks = [
    talk("a.md", { title: "HTTP/2 and You" }, new Date("2015-10-03")),
    talk("b.md", { title: "HTTP/2 and You" }, new Date("2015-07-18")),
    talk("c.md", { title: "HTTP/2 Server Push" }, new Date("2016-04-13")),
  ];
  assert.deepEqual(
    relatedTalks(talks, "a.md").map(item => item.inputPath),
    ["b.md", "c.md"]
  );
});

test("relatedTalks drops talks sharing nothing and honors the limit", () => {
  const talks = [
    talk("a.md", { title: "Caching for Coders" }, new Date("2012-03-24")),
    talk("b.md", { title: "Core Caching Concepts" }, new Date("2013-06-08")),
    talk(
      "c.md",
      { title: "Grokking the Object Cache" },
      new Date("2012-08-25")
    ),
    talk("d.md", { title: "Getting TLS Right" }, new Date("2015-03-14")),
  ];
  assert.deepEqual(
    relatedTalks(talks, "a.md", 1).map(item => item.inputPath),
    ["b.md"]
  );
});

test("relatedTalks returns nothing when the talk is not in the collection", () => {
  assert.deepEqual(relatedTalks([], "missing.md"), []);
});
