// HTML conditional revalidation.
//
// HTML carries max-age=0, must-revalidate, so the browser revalidates on every
// navigation. That stays cheap only because the edge answers a conditional
// request with a 304 from the GitHub Pages ETag instead of resending the body.
// These tests confirm the ETag is present and the 304 path works.

import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "./config.js";
import { request } from "./lib/curl.js";
import { retry } from "./lib/retry.js";

test("HTML responses carry an ETag", async () => {
  await retry(async () => {
    const res = await request(`${config.baseUrl}/`);
    assert.equal(res.status, 200);
    assert.ok(res.headers["etag"], "HTML must carry an ETag to revalidate");
  });
});

test("a conditional request for unchanged HTML returns 304", async () => {
  await retry(async () => {
    const first = await request(`${config.baseUrl}/`);
    const etag = first.headers["etag"];
    assert.ok(etag, "no ETag to revalidate against");
    const conditional = await request(`${config.baseUrl}/`, {
      ifNoneMatch: etag,
    });
    assert.equal(conditional.status, 304);
  });
});
