// Server-Timing emitted by the edge.
//
// server-timing-deliver.vcl sets a Server-Timing header whose metric names are
// field names (`pop`, `region`, `cache_status`, `total`, `backend`), which the
// RUM bundle maps straight onto span attributes as `fastly.<name>` and
// `fastly.<name>_ms` (see docs/edge-caching.md). The edge always emits the first
// four; `backend` appears only when the request fetched through the shield to
// GitHub Pages. These tests confirm the header is present and well-formed on an
// HTML response, and that the shield's internal header never reaches the client.

import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "./config.js";
import { request } from "./lib/curl.js";
import { retry } from "./lib/retry.js";

// One metric group looks like `cache_status;desc=HIT` or `total;dur=1.23`. Parse
// the header into a map of name -> { desc, dur } so assertions read the value,
// not the position.
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

test("HTML carries the edge Server-Timing fields", async () => {
  const res = await request(`${config.baseUrl}/`);
  assert.equal(res.status, 200);
  const header = res.headers["server-timing"];
  assert.ok(header, "no Server-Timing header on the HTML response");

  const metrics = parseServerTiming(header);

  assert.ok(metrics.total, `no total metric in Server-Timing: ${header}`);
  assert.ok(
    /^\d+(\.\d+)?$/.test(metrics.total.dur),
    `total dur is not numeric: ${header}`
  );

  // server.datacenter is the POP code and server.region is one of a fixed
  // 16-value list, both token-safe so both are emitted unquoted.
  assert.ok(
    /^[A-Za-z0-9]+$/.test(metrics.pop?.desc || ""),
    `pop desc is not a POP code: ${header}`
  );
  assert.ok(
    /^[A-Za-z-]+$/.test(metrics.region?.desc || ""),
    `region desc is not a region code: ${header}`
  );
  assert.ok(
    metrics.cache_status?.desc,
    `no cache_status in Server-Timing: ${header}`
  );
});

test("the shield's internal state header never reaches the client", async () => {
  // The shield sends Fastly-Shield-State back to the edge so the edge can derive
  // cache_status; the edge must strip it on every path.
  const res = await request(`${config.baseUrl}/?bust=${Date.now()}`);
  assert.equal(res.status, 200);
  assert.equal(
    res.headers["fastly-shield-state"],
    undefined,
    "Fastly-Shield-State leaked to the client"
  );
});

test("a cache miss reports a non-HIT cache_status and backend timing", async () => {
  // Force an origin fill so the request leaves the edge POP. A cache-busting
  // query string keeps the object out of the edge cache; the HTML is not
  // fingerprinted, so this is a plain uncached path. Retry to tolerate a brief
  // post-deploy propagation window.
  const metrics = await retry(async () => {
    const bust = `cache-bust-${Date.now()}`;
    const res = await request(`${config.baseUrl}/?${bust}`);
    assert.equal(res.status, 200);
    const header = res.headers["server-timing"] || "";
    const parsed = parseServerTiming(header);
    assert.ok(
      parsed.cache_status?.desc,
      `no cache_status in Server-Timing: ${header}`
    );
    assert.notEqual(
      parsed.cache_status.desc,
      "HIT",
      `cache-busted request reported an edge HIT: ${header}`
    );
    return parsed;
  });

  if (metrics.backend) {
    assert.ok(
      /^\d+(\.\d+)?$/.test(metrics.backend.dur),
      `backend dur is not numeric: ${JSON.stringify(metrics.backend)}`
    );
  } else {
    // Fastly skips the shield hop for a visitor whose nearest POP is already the
    // shield, so a single node plays both roles and no backend metric exists
    // even though the origin was contacted. That path cannot produce SHIELD_HIT,
    // which is derived from a shield response the edge never received.
    assert.notEqual(
      metrics.cache_status.desc,
      "SHIELD_HIT",
      "SHIELD_HIT reported without a backend metric, so the shield leg ran but " +
        "its timing was lost"
    );
  }
});
