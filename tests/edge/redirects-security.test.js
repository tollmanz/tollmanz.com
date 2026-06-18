// Redirects and transport security.
//
// Fastly forces HTTPS (force_ssl), redirects the apex to the canonical www host
// (apex-to-www snippets), and sets HSTS on responses. These keep every request
// on the canonical, encrypted origin. See docs/edge-caching.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "./config.js";
import { request } from "./lib/curl.js";

const HSTS_MIN_AGE = 31536000; // one year

test("http upgrades to https", async () => {
  const httpUrl = `${config.baseUrl.replace(/^https:/, "http:")}/`;
  const res = await request(httpUrl);
  assert.equal(res.status, 301);
  assert.ok(
    (res.headers["location"] || "").startsWith("https://"),
    `expected an https redirect, got: ${res.headers["location"]}`
  );
});

test(
  "the apex redirects to the canonical www host",
  { skip: config.isWww ? false : "base host is not a www subdomain" },
  async () => {
    const res = await request(`https://${config.apexHost}/`);
    assert.equal(res.status, 301);
    assert.equal(res.headers["location"], `https://${config.host}/`);
  }
);

test("the apex redirect preserves the path", async () => {
  if (!config.isWww) return;
  const res = await request(`https://${config.apexHost}/feed.xml`);
  assert.equal(res.status, 301);
  assert.equal(res.headers["location"], `https://${config.host}/feed.xml`);
});

test("HSTS is set with a long max-age", async () => {
  const res = await request(`${config.baseUrl}/`);
  const hsts = res.headers["strict-transport-security"] || "";
  const maxAge = Number((hsts.match(/max-age=(\d+)/) || [])[1] || 0);
  assert.ok(
    maxAge >= HSTS_MIN_AGE,
    `expected HSTS max-age >= ${HSTS_MIN_AGE}, got: ${hsts}`
  );
});
