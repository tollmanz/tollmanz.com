import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEATURED_LIMIT,
  emptyFilterStates,
  eventFacetSlug,
  eventFacets,
  featuredTalks,
  relatedTalks,
  sourceGroups,
  sourceLabel,
  speakingStats,
  talkEventType,
  talkFilterStates,
  talkHook,
  talkTopics,
  talkType,
  talksByYear,
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

test("sourceLabel joins the publisher and the title", () => {
  assert.equal(
    sourceLabel({ publisher: "Post Status", title: "LoopConf in review" }),
    "Post Status: LoopConf in review"
  );
});

test("sourceLabel falls back to the pre-migration label", () => {
  assert.equal(sourceLabel({ label: "Session" }), "Session");
  assert.equal(
    sourceLabel({ publisher: "WPSessions", label: "session recording" }),
    "WPSessions: session recording"
  );
});

test("sourceLabel prefers the title over the label", () => {
  assert.equal(
    sourceLabel({ title: "session recording", label: "WPSessions" }),
    "session recording"
  );
});

test("sourceLabel renders whichever field it has on its own", () => {
  assert.equal(sourceLabel({ title: "Code" }), "Code");
  assert.equal(sourceLabel({ publisher: "Fastly" }), "Fastly");
  assert.equal(sourceLabel(undefined), "");
});

test("sourceLabel never pulls the note into the link text", () => {
  assert.equal(
    sourceLabel({
      publisher: "Bluehost",
      title: "WordCamp San Diego recap",
      note: "Event recap carrying attendee feedback on this session.",
    }),
    "Bluehost: WordCamp San Diego recap"
  );
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

test("talksByYear groups the collection newest year first", () => {
  const groups = talksByYear([
    talk("a.md", {}, new Date("2017-02-07")),
    talk("b.md", {}, new Date("2015-11-18")),
    talk("c.md", {}, new Date("2019-06-04")),
  ]);
  assert.deepEqual(
    groups.map(group => [group.year, group.talks.map(item => item.inputPath)]),
    [
      [2019, ["c.md"]],
      [2017, ["a.md"]],
      [2015, ["b.md"]],
    ]
  );
});

test("talksByYear keeps the order the collection hands over", () => {
  const groups = talksByYear([
    talk("a.md", {}, new Date("2015-11-18")),
    talk("b.md", {}, new Date("2015-03-21")),
    talk("c.md", {}, new Date("2015-07-18")),
  ]);
  assert.deepEqual(groups.length, 1);
  assert.deepEqual(
    groups[0].talks.map(item => item.inputPath),
    ["a.md", "b.md", "c.md"]
  );
});

test("talksByYear reads the year in UTC", () => {
  const groups = talksByYear([talk("a.md", {}, new Date("2016-01-01"))]);
  assert.deepEqual(
    groups.map(group => group.year),
    [2016]
  );
});

test("talksByYear keeps an undated talk in a trailing null group", () => {
  const groups = talksByYear([
    talk("a.md", {}, new Date("nonsense")),
    talk("b.md", {}, new Date("2012-03-24")),
  ]);
  assert.deepEqual(
    groups.map(group => [group.year, group.talks.map(item => item.inputPath)]),
    [
      [2012, ["b.md"]],
      [null, ["a.md"]],
    ]
  );
});

test("talksByYear returns nothing for an empty collection", () => {
  assert.deepEqual(talksByYear([]), []);
  assert.deepEqual(talksByYear(undefined), []);
});

// Six talks placing two topics against two event facets, with the video and
// slides links spread so that some filter combinations match nothing.
function filterFixture() {
  const row = (topics, type, video, slides) => ({
    data: {
      topics,
      event: { type },
      video: video ? { url: "https://wordpress.tv/x/" } : {},
      slides: slides ? { url: "https://speakerdeck.com/x" } : {},
    },
  });
  return [
    row(["caching"], "wordcamp", true, false),
    row(["caching", "git"], "wordcamp", false, true),
    row(["git"], "wordcamp", false, false),
    row(["caching"], "meetup", true, true),
    row(["caching"], "meetup", false, false),
    row(["caching"], "meetup", false, false),
  ];
}

test("talkFilterStates enumerates every combination of the controls", () => {
  const states = talkFilterStates(filterFixture());
  assert.equal(states.length, 4 * 3 * 3);
  assert.deepEqual(states[0], { has: "", row: "", classes: [], count: 6 });
  assert.equal(
    new Set(states.map(state => state.has)).size,
    states.length,
    "each state is enumerated once"
  );
});

test("talkFilterStates orders the fragments the way the rules read", () => {
  const states = talkFilterStates(filterFixture());
  const state = states.find(
    entry => entry.classes.length === 4 && entry.classes[0] === ".topic-caching"
  );
  assert.equal(
    state.has,
    ":has(#flt-video:checked):has(#flt-slides:checked):has(#top-caching:checked):has(#evt-wordcamp:checked)"
  );
  assert.equal(state.row, ".topic-caching.evt-wordcamp.has-video.has-slides");
  assert.deepEqual(state.classes, [
    ".topic-caching",
    ".evt-wordcamp",
    ".has-video",
    ".has-slides",
  ]);
});

test("talkFilterStates counts the talks a state leaves visible", () => {
  const states = talkFilterStates(filterFixture());
  const count = row => states.find(state => state.row === row).count;
  assert.equal(count(".has-video"), 2);
  assert.equal(count(".has-video.has-slides"), 1);
  assert.equal(count(".topic-caching"), 5);
  assert.equal(count(".topic-git.evt-wordcamp"), 2);
  assert.equal(count(".topic-git.evt-meetup"), 0);
});

test("talkFilterStates folds an under-threshold event into its facet", () => {
  const states = talkFilterStates([
    { data: { topics: ["git"], event: { type: "loopconf" }, video: {} } },
  ]);
  assert.equal(states.find(state => state.row === ".evt-other").count, 1);
});

test("emptyFilterStates keeps only the loosest zero-result states", () => {
  const states = talkFilterStates(filterFixture());
  assert.equal(states.filter(state => state.count === 0).length, 10);
  assert.deepEqual(
    emptyFilterStates(states).map(state => state.row),
    [
      ".topic-git.evt-meetup",
      ".topic-git.has-video",
      ".evt-wordcamp.has-video.has-slides",
    ]
  );
});

test("emptyFilterStates covers every zero-result state", () => {
  const states = talkFilterStates(filterFixture());
  const loosest = emptyFilterStates(states);
  for (const state of states) {
    const covered = loosest.some(entry =>
      entry.classes.every(cls => state.classes.includes(cls))
    );
    assert.equal(
      covered,
      state.count === 0,
      `${state.row || "(no filters)"} matches ${state.count} talks`
    );
  }
});

test("emptyFilterStates returns nothing when every state matches", () => {
  const states = talkFilterStates([
    {
      data: {
        topics: ["git"],
        event: { type: "wordcamp" },
        video: { url: "https://wordpress.tv/x/" },
        slides: { url: "https://speakerdeck.com/x" },
      },
    },
  ]);
  assert.deepEqual(emptyFilterStates(states), []);
  assert.deepEqual(emptyFilterStates([]), []);
  assert.deepEqual(emptyFilterStates(undefined), []);
});

test("an empty collection collapses to the unfiltered empty state", () => {
  // The format checkboxes render whatever the collection holds, so an empty
  // collection still enumerates their four combinations; all of them fold into
  // the state that filters on nothing.
  const states = talkFilterStates([]);
  assert.equal(states.length, 4);
  assert.deepEqual(emptyFilterStates(states), [
    { has: "", row: "", classes: [], count: 0 },
  ]);
  assert.deepEqual(emptyFilterStates(talkFilterStates(undefined)).length, 1);
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

test("featuredTalks keeps only the talks that opt in with a boolean true", () => {
  const talks = [
    talk("a.md", { featured: true }),
    talk("b.md", {}),
    talk("c.md", { featured: false }),
    talk("d.md", { featured: "yes" }),
  ];
  assert.deepEqual(
    featuredTalks(talks).map(item => item.inputPath),
    ["a.md"]
  );
});

test("featuredTalks caps the tier no matter how many talks are flagged", () => {
  const talks = Array.from({ length: FEATURED_LIMIT + 3 }, (_, index) =>
    talk(`${index}.md`, { featured: true })
  );
  assert.equal(featuredTalks(talks).length, FEATURED_LIMIT);
  assert.deepEqual(
    featuredTalks(talks).map(item => item.inputPath),
    ["0.md", "1.md", "2.md", "3.md", "4.md"]
  );
});

test("featuredTalks returns an empty list for missing input", () => {
  assert.deepEqual(featuredTalks(undefined), []);
  assert.deepEqual(featuredTalks([]), []);
});

test("talkHook prefers the shortest quote that fits a card", () => {
  const hook = talkHook({
    description: "An abstract.",
    quotes: [
      { text: `${"long ".repeat(20)}quote.`, author: "Someone" },
      { text: "Short and quotable.", author: "Brian Krogsgard" },
    ],
  });
  assert.deepEqual(hook, {
    text: "Short and quotable.",
    cite: "Brian Krogsgard",
    quote: true,
  });
});

test("talkHook cites an unattributed quote by its source", () => {
  const hook = talkHook({
    quotes: [{ text: "Very informative.", source: "Event recap" }],
  });
  assert.equal(hook.cite, "Event recap");
});

test("talkHook falls back to the opening sentence when no quote fits", () => {
  const hook = talkHook({
    description:
      "Deploying HTTPS is a project, not a switch. The rest of the abstract " +
      "explains why.\n\nA second paragraph nobody reads.",
    quotes: [{ text: "x".repeat(400), author: "Someone" }],
  });
  assert.deepEqual(hook, {
    text: "Deploying HTTPS is a project, not a switch.",
    cite: "",
    quote: false,
  });
});

test("talkHook keeps an abbreviation inside the sentence it belongs to", () => {
  const hook = talkHook({
    description: "Put Backbone.js to work today. Then read on.",
  });
  assert.equal(hook.text, "Put Backbone.js to work today.");
});

test("talkHook returns nothing when the talk offers no short line", () => {
  assert.equal(talkHook({}), null);
  assert.equal(talkHook(undefined), null);
  assert.equal(talkHook({ description: `${"word ".repeat(60)}end.` }), null);
});
