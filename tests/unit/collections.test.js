import { test } from "node:test";
import assert from "node:assert/strict";
import registerCollections from "../../collections/index.js";
import { collectionProblems } from "../../collections/validate.js";

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

test("registerCollections registers posts, pages, and collectionMeta", () => {
  const config = fakeConfig();
  registerCollections(config);
  assert.deepEqual(Object.keys(config.collections).sort(), [
    "collectionMeta",
    "pages",
    "posts",
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

test("collectionMeta exposes item counts", () => {
  const config = fakeConfig();
  registerCollections(config);
  const api = fakeApi({
    [POSTS]: [item("src/posts/a.md", {}), item("src/posts/b.md", {})],
    [PAGES]: [item("src/pages/a.md", {})],
  });
  assert.deepEqual(config.collections.collectionMeta(api), {
    posts: 2,
    pages: 1,
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
  assert.deepEqual(config.collections.collectionMeta(api), {
    posts: 0,
    pages: 0,
  });
  assert.equal(console.error.mock.callCount(), 3);
});
