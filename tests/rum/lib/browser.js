// Loads a built RUM bundle in a real headless browser and reports what happened.
//
// The point is to execute the delivered bytes the way a visitor's browser
// would, so a `process is not defined`-style ReferenceError (an unlisted
// process.env reference that esbuild `define` never substituted) surfaces as an
// uncaught page error rather than passing an "esbuild built it" check. A Node
// vm sandbox cannot stand in here: the Honeycomb Web SDK touches enough browser
// surface (screen, PerformanceObserver, fetch, XHR) that a hand-rolled shim
// throws for the wrong reasons, masking the very failure this guard exists for.
//
// The bundle is served from a fake same-origin page and all network is stubbed,
// so the test needs no live OTLP collector: OTLP exports to /v1/traces are
// answered with 200 and recorded instead.

import { chromium } from "playwright";

const ORIGIN = "http://rum.test";
const TRACE_RE = /\/v1\/traces(\?|$)/;

// Run `source` (a built IIFE bundle) in headless Chromium and collect any
// uncaught page errors plus every OTLP trace export it attempts. Resolves once
// a trace export is seen or a page error is thrown, whichever comes first, so a
// clean bundle and a broken one both return promptly.
export async function runRumBundle(source, { timeoutMs = 20000 } = {}) {
  const pageErrors = [];
  const traceRequests = [];

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on("pageerror", err => pageErrors.push(err.message));

    await page.route("**/*", route => {
      const url = route.request().url();
      if (url === `${ORIGIN}/`) {
        return route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><meta charset="utf-8"><title>rum smoke</title><script src="/rum.js"></script>`,
        });
      }
      if (url === `${ORIGIN}/rum.js`) {
        return route.fulfill({ contentType: "text/javascript", body: source });
      }
      if (TRACE_RE.test(url)) {
        traceRequests.push({ url, method: route.request().method() });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        });
      }
      return route.fulfill({ status: 200, body: "" });
    });

    // Resolve as soon as the bundle either exports a trace (healthy) or throws
    // (broken); the fixed timeout is the backstop, not the expected path.
    const settled = Promise.race([
      page
        .waitForRequest(req => TRACE_RE.test(req.url()), { timeout: timeoutMs })
        .catch(() => {}),
      page.waitForEvent("pageerror", { timeout: timeoutMs }).catch(() => {}),
    ]);

    await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
    await settled;

    return { pageErrors, traceRequests };
  } finally {
    await browser.close();
  }
}
