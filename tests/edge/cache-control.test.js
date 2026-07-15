// Cache-Control by asset class.
//
// Validates the policy in infra/snippets/cache-control-fetch.vcl: fingerprinted
// CSS/JS and fonts are immutable, images and the favicon get a week, HTML and
// the feed/sitemap revalidate every time, and a 404 is never pinned immutable.
// See docs/edge-caching.md for the full contract.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { config, cacheControl } from "./config.js";
import { request } from "./lib/curl.js";
import { discoverAssets } from "./lib/site.js";
import { retry } from "./lib/retry.js";

let assets;

before(async () => {
  assets = await discoverAssets();
});

test("homepage HTML is served and revalidates every navigation", async () => {
  await retry(async () => {
    const res = await request(`${config.baseUrl}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers["cache-control"], cacheControl.revalidate);
  });
});

test("the feed revalidates every navigation", async () => {
  await retry(async () => {
    const res = await request(`${config.baseUrl}/feed.xml`);
    assert.equal(res.status, 200);
    assert.equal(res.headers["cache-control"], cacheControl.revalidate);
  });
});

test("the sitemap revalidates every navigation", async () => {
  await retry(async () => {
    const res = await request(`${config.baseUrl}/sitemap.xml`);
    assert.equal(res.status, 200);
    assert.equal(res.headers["cache-control"], cacheControl.revalidate);
  });
});

test("fingerprinted CSS is immutable", async () => {
  assert.ok(assets.cssUrl, "no fingerprinted stylesheet found in the homepage");
  await retry(async () => {
    const res = await request(assets.cssUrl);
    assert.equal(res.status, 200);
    assert.equal(res.headers["cache-control"], cacheControl.immutable);
  });
});

test("content-hashed fonts are immutable", async () => {
  assert.ok(assets.fontUrl, "no woff2 font found in the homepage");
  await retry(async () => {
    const res = await request(assets.fontUrl);
    assert.equal(res.status, 200);
    assert.equal(res.headers["cache-control"], cacheControl.immutable);
  });
});

test("the favicon is cached a week", async () => {
  await retry(async () => {
    const res = await request(`${config.baseUrl}/favicon.ico`);
    assert.equal(res.status, 200);
    assert.equal(res.headers["cache-control"], cacheControl.image);
  });
});

test("a 404 is not pinned immutable", async () => {
  const res = await request(
    `${config.baseUrl}/this-path-does-not-exist-xyz123`
  );
  assert.equal(res.status, 404);
  const cc = res.headers["cache-control"] || "";
  assert.ok(
    !cc.includes("immutable"),
    `404 must never be immutable, got: ${cc}`
  );
});
