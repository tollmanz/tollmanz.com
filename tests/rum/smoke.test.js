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

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import * as esbuild from "esbuild";
import { runRumBundle } from "./lib/browser.js";

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

let bundle;

before(() => {
  bundle = buildLocalBundle();
});

test("the built RUM bundle initializes without a process reference error", async () => {
  const { pageErrors } = await runRumBundle(bundle);
  const leak = pageErrors.find(msg => /process is not defined/i.test(msg));
  assert.equal(
    leak,
    undefined,
    `bundle threw a process reference error: ${leak}`
  );
  assert.deepEqual(
    pageErrors,
    [],
    `bundle initialization threw: ${pageErrors.join("; ")}`
  );
});

test("the built RUM bundle exports telemetry to /v1/traces", async () => {
  const { traceRequests } = await runRumBundle(bundle);
  assert.ok(
    traceRequests.length > 0,
    "expected at least one OTLP export to /v1/traces"
  );
  assert.equal(traceRequests[0].method, "POST");
});

test("the harness catches a process reference leaking into a bundle", async () => {
  const leaky = await buildLeakyBundle();
  const { pageErrors } = await runRumBundle(leaky, { timeoutMs: 5000 });
  assert.ok(
    pageErrors.some(msg => /process is not defined/i.test(msg)),
    `expected a "process is not defined" page error, got: ${JSON.stringify(pageErrors)}`
  );
});
