import { test } from "node:test";
import assert from "node:assert/strict";
import { talkBacklinks, writingPath } from "../../collections/backlinks.js";

const SITE = "https://www.tollmanz.com";

function talk(url, sources) {
  return { url, data: { title: url, sources } };
}

function writing(url) {
  return { kind: "writing", label: "Wrap-up", url };
}

test("writingPath keeps a site-relative path as is", () => {
  assert.equal(writingPath("/mwphp15/", SITE), "/mwphp15/");
});

test("writingPath adds the trailing slash Eleventy emits", () => {
  assert.equal(writingPath("/mwphp15", SITE), "/mwphp15/");
});

test("writingPath leaves a path ending in a filename alone", () => {
  assert.equal(writingPath("/feed.xml", SITE), "/feed.xml");
});

test("writingPath drops the query and fragment", () => {
  assert.equal(writingPath("/mwphp15/?utm=x#notes", SITE), "/mwphp15/");
});

test("writingPath reduces a same-origin absolute URL to its path", () => {
  assert.equal(writingPath(`${SITE}/mwphp15/`, SITE), "/mwphp15/");
});

test("writingPath rejects a URL on another origin", () => {
  assert.equal(writingPath("https://example.com/mwphp15/", SITE), null);
});

test("writingPath rejects empty and non-string input", () => {
  assert.equal(writingPath("", SITE), null);
  assert.equal(writingPath("   ", SITE), null);
  assert.equal(writingPath(null, SITE), null);
  assert.equal(writingPath(42, SITE), null);
});

test("writingPath still resolves relative URLs without a site URL", () => {
  assert.equal(writingPath("/mwphp15/"), "/mwphp15/");
  assert.equal(writingPath("https://example.com/mwphp15/"), null);
});

test("talkBacklinks keys a talk by the post its writing source names", () => {
  const tls = talk("/speaking/tls/", [writing("/mwphp15/")]);
  assert.deepEqual(talkBacklinks([tls], SITE), { "/mwphp15/": [tls] });
});

test("talkBacklinks collects several talks under one post", () => {
  const tls = talk("/speaking/tls/", [writing("/mwphp15/")]);
  const scaling = talk("/speaking/scaling/", [writing("/mwphp15/")]);
  assert.deepEqual(talkBacklinks([tls, scaling], SITE), {
    "/mwphp15/": [tls, scaling],
  });
});

test("talkBacklinks preserves the order the talks arrive in", () => {
  const first = talk("/speaking/a/", [writing("/post/")]);
  const second = talk("/speaking/b/", [writing("/post/")]);
  assert.deepEqual(talkBacklinks([second, first], SITE)["/post/"], [
    second,
    first,
  ]);
});

test("talkBacklinks records a repeated source once", () => {
  const item = talk("/speaking/tls/", [
    writing("/mwphp15/"),
    writing("/mwphp15"),
  ]);
  assert.deepEqual(talkBacklinks([item], SITE), { "/mwphp15/": [item] });
});

test("talkBacklinks ignores source kinds other than writing", () => {
  const item = talk("/speaking/tls/", [
    { kind: "session", url: "/session/" },
    { kind: "coverage", url: "/coverage/" },
    { kind: "code", url: "/code/" },
  ]);
  assert.deepEqual(talkBacklinks([item], SITE), {});
});

test("talkBacklinks ignores off-site writing links", () => {
  const item = talk("/speaking/tls/", [writing("https://example.com/recap/")]);
  assert.deepEqual(talkBacklinks([item], SITE), {});
});

test("talkBacklinks skips a talk with no URL of its own", () => {
  assert.deepEqual(talkBacklinks([talk(null, [writing("/post/")])], SITE), {});
});

test("talkBacklinks tolerates missing talks, sources, and entries", () => {
  assert.deepEqual(talkBacklinks(), {});
  assert.deepEqual(talkBacklinks(null, SITE), {});
  assert.deepEqual(talkBacklinks([null, undefined], SITE), {});
  assert.deepEqual(talkBacklinks([{ url: "/speaking/a/" }], SITE), {});
  assert.deepEqual(
    talkBacklinks([talk("/speaking/a/", [null, { kind: "writing" }])], SITE),
    {}
  );
});
