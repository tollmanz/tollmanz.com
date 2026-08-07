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
import { exportedSpans, runRumBundle, spanAttributes } from "./lib/browser.js";

// Build the real bundle exactly as production does, differing only in RUM_MODE,
// then read back the content-hashed artifact the same way src/_data/rum.js does.
// RUM_SAMPLE_RATE is pinned empty so an ambient value in a developer's shell
// cannot change what is under test; the sample-rate case overrides it.
function buildLocalBundle(env = {}) {
  execFileSync("node", ["scripts/build-rum.mjs"], {
    env: { ...process.env, RUM_MODE: "local", RUM_SAMPLE_RATE: "", ...env },
    stdio: "pipe",
  });
  const file = readdirSync("build/js").find(name =>
    /^rum\.[0-9a-f]{8,}\.js$/.test(name)
  );
  assert.ok(file, "build/js should contain a rum.<hash>.js bundle");
  return readFileSync(`build/js/${file}`, "utf8");
}

// The distinct SampleRate values stamped across every exported span. The
// Honeycomb SDK's deterministic sampler puts the configured rate on what it
// samples, and Honeycomb reads that attribute to reweight counts, so it is where
// the build-time knob becomes observable.
function sampledRates(traceRequests) {
  const rates = new Set();
  for (const span of exportedSpans(traceRequests)) {
    for (const { key, value } of span.attributes ?? []) {
      if (key === "SampleRate") rates.add(Number(Object.values(value)[0]));
    }
  }
  return rates;
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

// RUM_SAMPLE_RATE is silent by construction in the other direction: a build that
// stops injecting it, or an SDK bump that renames the option, drops the SDK back
// to its default rate of 1. Nothing throws, every assertion above stays green,
// and production quietly ingests 100% of traffic again. Only the exported
// SampleRate attribute distinguishes a configured rate from the default.
//
// Head sampling above 1 is random by design, so which traces survive a given
// page load is not fixed. Repeat the load until one exports rather than betting
// the suite on a single roll; at 1-in-2 a load that exports nothing at all is
// already rare, and the bundle is built once for all attempts.
test("the built RUM bundle samples at RUM_SAMPLE_RATE", async () => {
  const source = buildLocalBundle({ RUM_SAMPLE_RATE: "2" });
  let rates = new Set();
  for (let attempt = 0; attempt < 5 && rates.size === 0; attempt++) {
    const sampled = await runRumBundle(source, { timeoutMs: 8000 });
    assert.deepEqual(
      sampled.pageErrors,
      [],
      `sampled bundle threw: ${sampled.pageErrors.join("; ")}`
    );
    rates = sampledRates(sampled.traceRequests);
  }
  assert.deepEqual(
    [...rates],
    [2],
    "exported spans should carry the configured SampleRate"
  );
});

// HoneycombWebSDK appends its own WebVitalsInstrumentation unless
// `webVitalsInstrumentationConfig.enabled` is false, so also naming it in
// `instrumentations` registers two instances that both observe the same
// web-vitals callbacks and both emit a span. Every Core Web Vital is then
// recorded twice. Nothing throws, and P75 is unmoved because duplicating every
// sample preserves percentiles, so the boards in infra/honeycomb keep looking
// plausible while every COUNT over a vital reads 2x. Only the span count shows
// it, and only after the metrics report.
//
// TTFB is the sentinel. A duplicated registration duplicates all five vitals
// equally, and TTFB is the one that always reports: it comes off the navigation
// timing entry rather than needing paint, layout shift, or user interaction.
test("the built RUM bundle records each Core Web Vital exactly once", async () => {
  const pageView = await runRumBundle(buildLocalBundle(), { settleMs: 2500 });
  assert.deepEqual(
    pageView.pageErrors,
    [],
    `bundle threw: ${pageView.pageErrors.join("; ")}`
  );

  const ttfb = exportedSpans(pageView.traceRequests).filter(
    span => span.name === "TTFB"
  );
  assert.equal(
    ttfb.length,
    1,
    `expected exactly one TTFB span, got ${ttfb.length}. More than one means ` +
      `web vitals are registered twice: drop WebVitalsInstrumentation from ` +
      `the instrumentations list in assets/rum/index.js and let the SDK add it.`
  );
});

test("the harness catches a process reference leaking into a bundle", async () => {
  const leaky = await buildLeakyBundle();
  const { pageErrors } = await runRumBundle(leaky, { timeoutMs: 5000 });
  assert.ok(
    pageErrors.some(msg => /process is not defined/i.test(msg)),
    `expected a "process is not defined" page error, got: ${JSON.stringify(pageErrors)}`
  );
});
