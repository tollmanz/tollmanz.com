// Edge compression negotiation.
//
// GitHub Pages serves gzip or identity but never brotli. Fastly strips the
// backend Accept-Encoding (force-identity-fetch.vcl) so the origin returns
// identity, then compresses at the edge to brotli or gzip to match the client.
// These tests confirm the edge negotiates the right encoding, varies on it, and
// leaves already-compressed assets alone. See docs/edge-caching.md.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { config } from "./config.js";
import { request, bodySize } from "./lib/curl.js";
import { discoverAssets } from "./lib/site.js";

let assets;

before(async () => {
  assets = await discoverAssets();
});

test("HTML is served brotli to a brotli-capable client", async () => {
  const res = await request(`${config.baseUrl}/`, { acceptEncoding: "br" });
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-encoding"], "br");
});

test("HTML falls back to gzip when brotli is not accepted", async () => {
  const res = await request(`${config.baseUrl}/`, { acceptEncoding: "gzip" });
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-encoding"], "gzip");
});

test("HTML is served identity when no encoding is accepted", async () => {
  const res = await request(`${config.baseUrl}/`);
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-encoding"], undefined);
});

test("the edge prefers brotli over gzip when both are accepted", async () => {
  const res = await request(`${config.baseUrl}/`, {
    acceptEncoding: "gzip, deflate, br",
  });
  assert.equal(res.headers["content-encoding"], "br");
});

test("compressible responses vary on Accept-Encoding", async () => {
  const res = await request(`${config.baseUrl}/`, { acceptEncoding: "br" });
  const vary = (res.headers["vary"] || "").toLowerCase();
  assert.ok(
    vary.includes("accept-encoding"),
    `expected Vary to include Accept-Encoding, got: ${res.headers["vary"]}`
  );
});

test("fingerprinted CSS is served brotli", async () => {
  assert.ok(assets.cssUrl, "no fingerprinted stylesheet found");
  const res = await request(assets.cssUrl, { acceptEncoding: "br" });
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-encoding"], "br");
});

test("already-compressed fonts are not re-compressed", async () => {
  assert.ok(assets.fontUrl, "no woff2 font found");
  const res = await request(assets.fontUrl, { acceptEncoding: "br, gzip" });
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-encoding"], undefined);
});

test("brotli meaningfully shrinks the HTML payload", async () => {
  const identity = await bodySize(`${config.baseUrl}/`);
  const brotli = await bodySize(`${config.baseUrl}/`, { acceptEncoding: "br" });
  const gzip = await bodySize(`${config.baseUrl}/`, { acceptEncoding: "gzip" });
  assert.ok(identity > 0, "could not measure identity size");
  assert.ok(
    brotli < identity,
    `brotli (${brotli}) should be smaller than identity (${identity})`
  );
  assert.ok(
    brotli <= gzip,
    `brotli (${brotli}) should be no larger than gzip (${gzip})`
  );
});
