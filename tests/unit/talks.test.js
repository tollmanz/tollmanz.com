import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eventFacetSlug,
  eventFacets,
  relatedTalks,
  sourceGroups,
  speakingStats,
  talkEventType,
  talkTopics,
  talkType,
  topicFacets,
} from "../../filters/talks.js";

function talk(inputPath, data, date) {
  return { inputPath, data, date: date ?? new Date("2015-01-01") };
}

test("talkTopics resolves slugs to labels in the order the talk lists them", () => {
  assert.deepEqual(talkTopics(["wordpress", "caching"]), [
    { slug: "wordpress", label: "WordPress" },
    { slug: "caching", label: "Caching" },
  ]);
});

test("talkTopics echoes an unknown slug instead of dropping it", () => {
  assert.deepEqual(talkTopics(["made-up"]), [
    { slug: "made-up", label: "made-up" },
  ]);
});

test("talkTopics returns an empty list when topics are missing", () => {
  assert.deepEqual(talkTopics(undefined), []);
  assert.deepEqual(talkTopics([]), []);
});

test("talkType labels the known formats and defaults to talk", () => {
  assert.deepEqual(talkType("keynote"), { slug: "keynote", label: "Keynote" });
  assert.deepEqual(talkType("panel"), { slug: "panel", label: "Panel" });
  assert.deepEqual(talkType(undefined), { slug: "talk", label: "Talk" });
});

test("talkEventType labels the known events and defaults to other", () => {
  assert.deepEqual(talkEventType("phpworld"), {
    slug: "phpworld",
    label: "php[world]",
  });
  assert.deepEqual(talkEventType(undefined), {
    slug: "other",
    label: "Other",
  });
});

test("sourceGroups splits sources by their declared kind", () => {
  const groups = sourceGroups([
    { kind: "code", label: "Code", url: "https://github.com/tollmanz/x" },
    { kind: "writing", label: "Blog post", url: "/grokking/" },
    { kind: "session", label: "Session", url: "https://example.com/session" },
    { kind: "coverage", label: "Recap", url: "https://example.com/recap" },
  ]);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(groups).map(([kind, list]) => [
        kind,
        list.map(source => source.label),
      ])
    ),
    {
      session: ["Session"],
      code: ["Code"],
      writing: ["Blog post"],
      coverage: ["Recap"],
    }
  );
});

test("sourceGroups keeps an unknown kind out of the action buttons", () => {
  const groups = sourceGroups([
    { kind: "nonsense", label: "Odd", url: "https://example.com/" },
  ]);
  assert.deepEqual(groups.code, []);
  assert.deepEqual(
    groups.coverage.map(source => source.label),
    ["Odd"]
  );
});

test("sourceGroups skips entries without a url", () => {
  const groups = sourceGroups([
    { kind: "session", label: "Session", url: "" },
    null,
  ]);
  assert.deepEqual(groups.session, []);
});

test("sourceGroups always returns every group", () => {
  assert.deepEqual(Object.keys(sourceGroups(undefined)), [
    "session",
    "code",
    "writing",
    "coverage",
  ]);
});

test("topicFacets counts declared topics and keeps taxonomy order", () => {
  const facets = topicFacets([
    talk("a.md", { topics: ["wordpress", "caching"] }),
    talk("b.md", { topics: ["caching"] }),
    talk("c.md", { topics: ["https-tls"] }),
  ]);
  assert.deepEqual(facets, [
    { slug: "https-tls", label: "HTTPS & TLS", count: 1 },
    { slug: "caching", label: "Caching", count: 2 },
    { slug: "wordpress", label: "WordPress", count: 1 },
  ]);
});

test("topicFacets omits topics nobody speaks about", () => {
  const slugs = topicFacets([talk("a.md", { topics: ["git"] })]).map(
    facet => facet.slug
  );
  assert.deepEqual(slugs, ["git"]);
});

// `count` talks at the same kind of event, one per input path.
function eventTalks(type, count) {
  return Array.from({ length: count }, (_, index) =>
    talk(`${type}-${index}.md`, type ? { event: { type } } : {})
  );
}

test("eventFacets counts declared event types in taxonomy order", () => {
  const facets = eventFacets([
    ...eventTalks("meetup", 4),
    ...eventTalks("wordcamp", 3),
    ...eventTalks("phpworld", 3),
  ]);
  assert.deepEqual(facets, [
    { slug: "wordcamp", label: "WordCamp", count: 3 },
    { slug: "phpworld", label: "php[world]", count: 3 },
    { slug: "meetup", label: "Meetup", count: 4 },
  ]);
});

test("eventFacets folds events under the threshold into other", () => {
  const facets = eventFacets([
    ...eventTalks("wordcamp", 5),
    ...eventTalks("velocity", 1),
    ...eventTalks("xbiz", 1),
    ...eventTalks("altitude", 1),
  ]);
  assert.deepEqual(facets, [
    { slug: "wordcamp", label: "WordCamp", count: 5 },
    { slug: "other", label: "Other", count: 3 },
  ]);
});

test("eventFacets keeps three talks and folds two", () => {
  const facets = eventFacets([
    ...eventTalks("meetup", 3),
    ...eventTalks("loopconf", 2),
  ]);
  assert.deepEqual(facets, [
    { slug: "meetup", label: "Meetup", count: 3 },
    { slug: "other", label: "Other", count: 2 },
  ]);
});

test("eventFacets counts a talk with no event type as other", () => {
  const facets = eventFacets([
    ...eventTalks("wordcamp", 3),
    ...eventTalks(undefined, 3),
  ]);
  assert.deepEqual(facets.at(-1), { slug: "other", label: "Other", count: 3 });
});

test("eventFacets still reports an event type outside the taxonomy", () => {
  const facets = eventFacets([
    ...eventTalks("wordcamp", 3),
    ...eventTalks("smashingconf", 3),
  ]);
  assert.deepEqual(facets.at(-1), {
    slug: "smashingconf",
    label: "smashingconf",
    count: 3,
  });
});

test("eventFacets folds an under-threshold unknown event type into other", () => {
  const facets = eventFacets([
    ...eventTalks("wordcamp", 3),
    ...eventTalks("smashingconf", 2),
  ]);
  assert.deepEqual(facets, [
    { slug: "wordcamp", label: "WordCamp", count: 3 },
    { slug: "other", label: "Other", count: 2 },
  ]);
});

test("eventFacetSlug maps each event type to the facet it filters under", () => {
  const talks = [
    ...eventTalks("wordcamp", 3),
    ...eventTalks("loopconf", 2),
    ...eventTalks("velocity", 1),
    ...eventTalks(undefined, 1),
  ];
  assert.deepEqual(eventFacetSlug(talks), {
    wordcamp: "wordcamp",
    loopconf: "other",
    velocity: "other",
    other: "other",
  });
});

test("eventFacetSlug points every talk at a rendered facet", () => {
  const talks = [
    ...eventTalks("wordcamp", 21),
    ...eventTalks("meetup", 3),
    ...eventTalks("phpworld", 2),
    ...eventTalks("midwestphp", 2),
    ...eventTalks("loopconf", 2),
    ...eventTalks("xbiz", 1),
    ...eventTalks("wpsessions", 1),
    ...eventTalks("velocity", 1),
    ...eventTalks("altitude", 1),
  ];
  const facets = eventFacets(talks);
  const facetOf = eventFacetSlug(talks);
  const rendered = new Set(facets.map(facet => facet.slug));
  for (const talk of talks) {
    assert.ok(rendered.has(facetOf[talk.data.event.type]));
  }
  assert.deepEqual(
    facets.map(facet => [facet.label, facet.count]),
    [
      ["WordCamp", 21],
      ["Meetup", 3],
      ["Other", 10],
    ]
  );
  assert.equal(
    facets.reduce((total, facet) => total + facet.count, 0),
    talks.length
  );
});

test("eventFacetSlug returns nothing for an empty collection", () => {
  assert.deepEqual(eventFacetSlug([]), {});
  assert.deepEqual(eventFacetSlug(undefined), {});
});

test("speakingStats counts only video and slides that have a url", () => {
  const stats = speakingStats([
    talk(
      "a.md",
      { video: { url: "https://wordpress.tv/x/" } },
      new Date("2012-03-24")
    ),
    talk(
      "b.md",
      { slides: { url: "https://speakerdeck.com/x" } },
      new Date("2019-11-02")
    ),
    talk("c.md", { slides: { count: 76 } }, new Date("2015-07-18")),
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

test("relatedTalks ranks another delivery of the same series first", () => {
  const talks = [
    talk(
      "a.md",
      { series: "http-2-and-you", topics: ["http2"] },
      new Date("2015-10-03")
    ),
    talk("b.md", { topics: ["http2", "performance"] }, new Date("2016-04-13")),
    talk(
      "c.md",
      { series: "http-2-and-you", topics: ["http2"] },
      new Date("2015-07-18")
    ),
  ];
  assert.deepEqual(
    relatedTalks(talks, "a.md").map(item => item.inputPath),
    ["c.md", "b.md"]
  );
});

test("relatedTalks does not treat a missing series as a match", () => {
  const talks = [
    talk("a.md", { topics: ["git"] }, new Date("2013-06-30")),
    talk("b.md", { topics: ["wordpress"] }, new Date("2012-03-24")),
  ];
  assert.deepEqual(relatedTalks(talks, "a.md"), []);
});

test("relatedTalks honors the limit and prefers newer talks within a score", () => {
  const talks = [
    talk("a.md", { topics: ["caching"] }, new Date("2012-03-24")),
    talk("b.md", { topics: ["caching"] }, new Date("2013-06-08")),
    talk("c.md", { topics: ["caching"] }, new Date("2015-11-18")),
  ];
  assert.deepEqual(
    relatedTalks(talks, "a.md", 1).map(item => item.inputPath),
    ["c.md"]
  );
});

test("relatedTalks returns nothing when the talk is not in the collection", () => {
  assert.deepEqual(relatedTalks([], "missing.md"), []);
});
