// Server-Timing emitted by the edge.
//
// server-timing-deliver.vcl sets a Server-Timing header carrying backend and
// edge processing time so the browser RUM can attribute latency (see
// docs/edge-caching.md). The header is assembled at the customer edge POP: it
// always contains an `edge` metric, and an `origin` metric whenever the request
// fetched through the shield to GitHub Pages. These tests confirm the header is
// present and well-formed on an HTML response.

import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "./config.js";
import { request } from "./lib/curl.js";
import { retry } from "./lib/retry.js";

// One metric group looks like `edge;desc=HIT;dur=1.23`. Parse the header into a
// map of name -> { desc, dur } so assertions read the value, not the position.
function parseServerTiming(header) {
  const metrics = {};
  for (const group of header.split(",")) {
    const parts = group.split(";").map(p => p.trim());
    const name = parts[0];
    if (!name) continue;
    const entry = {};
    for (const part of parts.slice(1)) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      entry[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
    metrics[name] = entry;
  }
  return metrics;
}

test("HTML carries a Server-Timing header with an edge metric", async () => {
  const res = await request(`${config.baseUrl}/`);
  assert.equal(res.status, 200);
  const header = res.headers["server-timing"];
  assert.ok(header, "no Server-Timing header on the HTML response");

  const metrics = parseServerTiming(header);
  assert.ok(metrics.edge, `no edge metric in Server-Timing: ${header}`);
  assert.ok(
    /^\d+(\.\d+)?$/.test(metrics.edge.dur),
    `edge dur is not numeric: ${header}`
  );
  assert.ok(metrics.edge.desc, `edge metric has no desc (state): ${header}`);
});

test("a cache miss reports the origin backend metric", async () => {
  // Force an origin fill so the shield contributes the origin metric, then
  // assert the edge forwarded it. A cache-busting query string keeps the object
  // out of the edge cache; the HTML is not fingerprinted, so this is a plain
  // uncached path. Retry to tolerate a brief post-deploy propagation window.
  const metrics = await retry(async () => {
    const bust = `cache-bust-${Date.now()}`;
    const res = await request(`${config.baseUrl}/?${bust}`);
    assert.equal(res.status, 200);
    const header = res.headers["server-timing"] || "";
    const parsed = parseServerTiming(header);
    assert.ok(parsed.origin, `no origin metric in Server-Timing: ${header}`);
    return parsed;
  });

  assert.ok(
    /^\d+(\.\d+)?$/.test(metrics.origin.dur),
    `origin dur is not numeric: ${JSON.stringify(metrics.origin)}`
  );
  assert.ok(metrics.origin.desc, "origin metric has no desc (state)");
});
