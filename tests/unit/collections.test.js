import { test } from "node:test";
import assert from "node:assert/strict";
import registerCollections from "../../collections/index.js";
import {
  collectionProblems,
  talkProblems,
} from "../../collections/validate.js";

function item(inputPath, data) {
  return { inputPath, data };
}

// Minimal stand-ins for the Eleventy config and collection API surfaces the
// module touches, so registration and collection callbacks run for real.
function fakeConfig() {
  const collections = {};
  return {
    collections,
    addCollection(name, callback) {
      collections[name] = callback;
    },
  };
}

function fakeApi(byGlob) {
  return {
    getFilteredByGlob(glob) {
      const items = byGlob[glob];
      if (!items) {
        throw new Error(`unexpected glob: ${glob}`);
      }
      return items.slice();
    },
  };
}

const POSTS = "src/posts/*.md";
const PAGES = "src/pages/*.md";
const TALKS = "src/talks/*.md";

test("collectionProblems reports nothing for well-formed items", () => {
  const items = [
    item("src/posts/a.md", { title: "A", date: new Date("2026-01-01") }),
  ];
  assert.deepEqual(collectionProblems(items, "posts"), []);
});

test("collectionProblems names the file and the missing field", () => {
  const problems = collectionProblems(
    [item("src/posts/a.md", { date: new Date("2026-01-01") })],
    "posts"
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /posts: "src\/posts\/a\.md"/);
  assert.match(problems[0], /field "title"/);
});

test("collectionProblems treats null and empty string as missing", () => {
  const problems = collectionProblems(
    [item("src/pages/a.md", { title: "", date: null })],
    "pages"
  );
  assert.equal(problems.length, 2);
});

test("collectionProblems reports one problem per missing field", () => {
  const problems = collectionProblems([item("src/posts/a.md", {})], "posts");
  assert.deepEqual(
    problems.map(p => p.match(/field "(\w+)"/)[1]),
    ["title", "date"]
  );
});

test("collectionProblems flags an unparseable date", () => {
  const problems = collectionProblems(
    [item("src/posts/a.md", { title: "A", date: "not a date" })],
    "posts"
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /invalid date value/);
});

test("collectionProblems does not double-report a missing date as invalid", () => {
  const problems = collectionProblems(
    [item("src/posts/a.md", { title: "A" })],
    "posts"
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /field "date"/);
});

test("collectionProblems accepts a date string Date can parse", () => {
  const problems = collectionProblems(
    [item("src/posts/a.md", { title: "A", date: "2026-01-01" })],
    "posts"
  );
  assert.deepEqual(problems, []);
});

test("collectionProblems tolerates items without inputPath or data", () => {
  const problems = collectionProblems([{}], "posts");
  assert.equal(problems.length, 2);
  for (const problem of problems) {
    assert.match(problem, /\(unknown file\)/);
  }
});

test("collectionProblems returns an empty list for non-array input", () => {
  assert.deepEqual(collectionProblems(null, "posts"), []);
  assert.deepEqual(collectionProblems(undefined, "posts"), []);
});

test("registerCollections registers every collection", () => {
  const config = fakeConfig();
  registerCollections(config);
  assert.deepEqual(Object.keys(config.collections).sort(), [
    "collectionMeta",
    "pages",
    "posts",
    "talkBacklinks",
    "talks",
  ]);
});

test("posts is sorted newest first", () => {
  const config = fakeConfig();
  registerCollections(config);
  const api = fakeApi({
    [POSTS]: [
      { inputPath: "src/posts/old.md", date: new Date("2020-01-01"), data: {} },
      { inputPath: "src/posts/new.md", date: new Date("2026-01-01"), data: {} },
    ],
  });
  const posts = config.collections.posts(api);
  assert.deepEqual(
    posts.map(p => p.inputPath),
    ["src/posts/new.md", "src/posts/old.md"]
  );
});

test("pages keeps the glob order", () => {
  const config = fakeConfig();
  registerCollections(config);
  const api = fakeApi({
    [PAGES]: [item("src/pages/b.md", {}), item("src/pages/a.md", {})],
  });
  assert.deepEqual(
    config.collections.pages(api).map(p => p.inputPath),
    ["src/pages/b.md", "src/pages/a.md"]
  );
});

test("talks is sorted newest first", () => {
  const config = fakeConfig();
  registerCollections(config);
  const api = fakeApi({
    [TALKS]: [
      { inputPath: "src/talks/old.md", date: new Date("2012-03-24"), data: {} },
      { inputPath: "src/talks/new.md", date: new Date("2019-11-02"), data: {} },
    ],
  });
  assert.deepEqual(
    config.collections.talks(api).map(t => t.inputPath),
    ["src/talks/new.md", "src/talks/old.md"]
  );
});

test("talkBacklinks keys talks by the post their writing source names", () => {
  const config = fakeConfig();
  registerCollections(config);
  const older = {
    inputPath: "src/talks/old.md",
    url: "/speaking/old/",
    date: new Date("2015-03-14"),
    data: { sources: [{ kind: "writing", url: "/mwphp15/" }] },
  };
  const newer = {
    inputPath: "src/talks/new.md",
    url: "/speaking/new/",
    date: new Date("2015-03-15"),
    data: { sources: [{ kind: "writing", url: "/mwphp15/" }] },
  };
  const api = fakeApi({ [TALKS]: [older, newer] });
  assert.deepEqual(config.collections.talkBacklinks(api), {
    "/mwphp15/": [newer, older],
  });
});

test("collectionMeta exposes item counts", () => {
  const config = fakeConfig();
  registerCollections(config);
  const api = fakeApi({
    [POSTS]: [item("src/posts/a.md", {}), item("src/posts/b.md", {})],
    [PAGES]: [item("src/pages/a.md", {})],
    [TALKS]: [],
  });
  assert.deepEqual(config.collections.collectionMeta(api), {
    posts: 2,
    pages: 1,
    talks: 0,
  });
});

test("a validation warning does not drop the item from the collection", t => {
  t.mock.method(console, "warn", () => {});
  const config = fakeConfig();
  registerCollections(config);
  const api = fakeApi({ [PAGES]: [item("src/pages/a.md", {})] });
  assert.equal(config.collections.pages(api).length, 1);
  assert.equal(console.warn.mock.callCount(), 2);
});

test("a throwing collection degrades to empty instead of crashing", t => {
  t.mock.method(console, "error", () => {});
  const config = fakeConfig();
  registerCollections(config);
  const api = {
    getFilteredByGlob() {
      throw new Error("boom");
    },
  };
  assert.deepEqual(config.collections.posts(api), []);
  assert.deepEqual(config.collections.pages(api), []);
  assert.deepEqual(config.collections.talks(api), []);
  assert.deepEqual(config.collections.talkBacklinks(api), {});
  assert.deepEqual(config.collections.collectionMeta(api), {
    posts: 0,
    pages: 0,
    talks: 0,
  });
  assert.equal(console.error.mock.callCount(), 5);
});

function validTalk(overrides = {}) {
  return item("src/talks/a.md", {
    title: "A Talk",
    date: new Date("2015-01-01"),
    type: "talk",
    topics: ["caching"],
    event: { name: "WordCamp Somewhere", type: "wordcamp" },
    ...overrides,
  });
}

test("talkProblems reports nothing for a well-formed talk", () => {
  assert.deepEqual(talkProblems([validTalk()], "talks"), []);
});

test("talkProblems flags a type outside the taxonomy", () => {
  const problems = talkProblems([validTalk({ type: "fireside" })], "talks");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /unknown type "fireside"/);
});

test("talkProblems accepts a known datePrecision and flags an unknown one", () => {
  assert.deepEqual(
    talkProblems([validTalk({ datePrecision: "year" })], "talks"),
    []
  );
  const problems = talkProblems(
    [validTalk({ datePrecision: "decade" })],
    "talks"
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /unknown datePrecision "decade"/);
});

test("talkProblems flags missing and unknown topics", () => {
  assert.match(
    talkProblems([validTalk({ topics: [] })], "talks")[0],
    /field "topics"/
  );
  assert.match(
    talkProblems([validTalk({ topics: ["caching", "nope"] })], "talks")[0],
    /unknown topic "nope"/
  );
});

test("talkProblems flags a missing event name and an unknown event type", () => {
  const problems = talkProblems(
    [validTalk({ event: { type: "unconference" } })],
    "talks"
  );
  assert.equal(problems.length, 2);
  assert.match(problems[0], /field "event.name"/);
  assert.match(problems[1], /unknown event type "unconference"/);
});

test("talkProblems flags sources missing a kind, title, or url", () => {
  const problems = talkProblems(
    [
      validTalk({
        sources: [
          { kind: "elsewhere", title: "Recap", url: "https://example.com/" },
          { kind: "session", url: "https://example.com/session" },
        ],
      }),
    ],
    "talks"
  );
  assert.equal(problems.length, 2);
  assert.match(problems[0], /unknown kind "elsewhere"/);
  assert.match(problems[1], /without a title or url/);
});

test("talkProblems accepts a source that still carries only a label", () => {
  const problems = talkProblems(
    [
      validTalk({
        sources: [
          { kind: "coverage", label: "Recap", url: "https://example.com/" },
        ],
      }),
    ],
    "talks"
  );
  assert.deepEqual(problems, []);
});

test("talkProblems accepts a boolean featured and flags anything else", () => {
  assert.deepEqual(talkProblems([validTalk({ featured: true })], "talks"), []);
  assert.deepEqual(talkProblems([validTalk({ featured: false })], "talks"), []);
  const problems = talkProblems([validTalk({ featured: "yes" })], "talks");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /non-boolean "featured" value "yes"/);
});

test("talkProblems flags a video or slides block with no url", () => {
  const problems = talkProblems(
    [validTalk({ video: { provider: "YouTube" }, slides: { count: 76 } })],
    "talks"
  );
  assert.deepEqual(
    problems.map(problem => problem.match(/"(video|slides)" block/)[1]),
    ["video", "slides"]
  );
});

test("talkProblems names the offending file", () => {
  const problems = talkProblems([item("src/talks/bad.md", {})], "talks");
  for (const problem of problems) {
    assert.match(problem, /talks: "src\/talks\/bad\.md"/);
  }
});

test("talkProblems returns an empty list for non-array input", () => {
  assert.deepEqual(talkProblems(null, "talks"), []);
});

test("the talks collection warns about both shared and talk-specific problems", t => {
  t.mock.method(console, "warn", () => {});
  const config = fakeConfig();
  registerCollections(config);
  const api = fakeApi({ [TALKS]: [item("src/talks/a.md", { title: "A" })] });
  assert.equal(config.collections.talks(api).length, 1);
  const warnings = console.warn.mock.calls.map(call => call.arguments[0]);
  assert.ok(warnings.some(warning => /field "date"/.test(warning)));
  assert.ok(warnings.some(warning => /field "topics"/.test(warning)));
});
