// Runtime guard for the browser RUM bundle (see PR #45 and issue #61).
//
// esbuild `define` only substitutes the process.env keys listed in
// scripts/build-rum.mjs. An @opentelemetry/* or @honeycombio/* bump that adds
// an unlisted process.env reference would ship a bare `process` into the bundle
// and throw `process is not defined` in the browser, and nothing downstream of
// "esbuild built it" would notice. These tests build the real RUM bundle with
// RUM_MODE=local and execute it in headless Chromium, so such a leak fails the
// build here rather than in a visitor's console.
//
// A `process`/`global` shim injected via esbuild would silence that error, but
// it would also hide the leak from this guard, so the bundle deliberately has
// no shim: this test is the safety net instead.
//
// The same bump can break the bundle without throwing at all. The Fastly
// Server-Timing mapping rides on an OTel instrumentation config key, and the
// instrumentation swallows anything that callback throws, so that half is
// checked against the exported OTLP payload rather than the page's error log.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import * as esbuild from "esbuild";
import { runRumBundle, spanAttributes } from "./lib/browser.js";

// Build the real bundle exactly as production does, differing only in RUM_MODE,
// then read back the content-hashed artifact the same way src/_data/rum.js does.
function buildLocalBundle() {
  execFileSync("node", ["scripts/build-rum.mjs"], {
    env: { ...process.env, RUM_MODE: "local" },
    stdio: "pipe",
  });
  const file = readdirSync("build/js").find(name =>
    /^rum\.[0-9a-f]{8,}\.js$/.test(name)
  );
  assert.ok(file, "build/js should contain a rum.<hash>.js bundle");
  return readFileSync(`build/js/${file}`, "utf8");
}

// A minimal bundle that reads an undefined process.env key at load time. esbuild
// leaves the reference untouched (it is not in `define`), reproducing exactly
// the leak an OTel/Honeycomb bump could introduce. Used as a negative control to
// prove the browser harness actually catches the failure mode.
async function buildLeakyBundle() {
  const result = await esbuild.build({
    stdin: {
      contents: "window.__rumLeak = process.env.OTEL_UNSET_AT_BUILD_TIME;",
      loader: "js",
    },
    bundle: true,
    format: "iife",
    write: false,
  });
  return result.outputFiles[0].text;
}

let run;

// One page load backs every assertion below: the bundle either loads cleanly and
// exports once, or it does not, and three separate browser launches would only
// pay the exporter's batch delay three times over to observe the same thing.
before(async () => {
  run = await runRumBundle(buildLocalBundle());
});

test("the built RUM bundle initializes without a process reference error", () => {
  const leak = run.pageErrors.find(msg => /process is not defined/i.test(msg));
  assert.equal(
    leak,
    undefined,
    `bundle threw a process reference error: ${leak}`
  );
  assert.deepEqual(
    run.pageErrors,
    [],
    `bundle initialization threw: ${run.pageErrors.join("; ")}`
  );
});

test("the built RUM bundle exports telemetry to /v1/traces", () => {
  assert.ok(
    run.traceRequests.length > 0,
    "expected at least one OTLP export to /v1/traces"
  );
  assert.equal(run.traceRequests[0].method, "POST");
});

// The bundle reads the navigation's Server-Timing metrics and copies them onto
// the document-fetch span. That mapping hangs off an OTel instrumentation config
// key (applyCustomAttributesOnSpan.documentFetch), and a throw inside that
// callback is swallowed by the instrumentation rather than raised as a page
// error, so a dependency bump could sever the Fastly edge telemetry without any
// of the assertions above going red. Only the exported payload shows it.
test("the built RUM bundle maps Fastly Server-Timing onto the document-fetch span", () => {
  const attributes = spanAttributes(run.traceRequests, "documentFetch");
  const fastly = Object.fromEntries(
    Object.entries(attributes).filter(([key]) => key.startsWith("fastly."))
  );
  // Each header field yields exactly one attribute: a dur field a numeric
  // <name>_ms, a desc field a string <name>. Neither kind produces the other.
  assert.deepEqual(fastly, {
    "fastly.backend_ms": 17.5,
    "fastly.pop": "LHR",
    "fastly.region": "Europe",
    "fastly.cache_status": "MISS",
    "fastly.total_ms": 42.1,
  });
});

test("the harness catches a process reference leaking into a bundle", async () => {
  const leaky = await buildLeakyBundle();
  const { pageErrors } = await runRumBundle(leaky, { timeoutMs: 5000 });
  assert.ok(
    pageErrors.some(msg => /process is not defined/i.test(msg)),
    `expected a "process is not defined" page error, got: ${JSON.stringify(pageErrors)}`
  );
});
