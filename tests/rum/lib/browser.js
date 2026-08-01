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
// answered with 200 and recorded, payload included.

import { chromium } from "playwright";

const ORIGIN = "http://rum.test";
const TRACE_RE = /\/v1\/traces(\?|$)/;

// The Server-Timing header the fake page returns, mirroring what the Fastly edge
// emits in production: the shield's backend metric first, then the edge's own
// fields (see infra/fastly/snippets/server-timing-deliver.vcl). Serving it means
// the bundle's addServerTimingAttributes mapping actually runs here instead of
// taking its no-header early return, so the mapping is exercised in a browser
// that parses the header for real rather than against a hand-built fixture.
export const SERVER_TIMING =
  "backend;dur=17.5, pop;desc=LHR, region;desc=Europe, " +
  "cache_status;desc=MISS, total;dur=42.1";

// Run `source` (a built IIFE bundle) in headless Chromium and collect any
// uncaught page errors plus every OTLP trace export it attempts. Resolves once
// a trace export is recorded or a page error is thrown, whichever comes first,
// so a clean bundle and a broken one both return promptly.
export async function runRumBundle(source, { timeoutMs = 20000 } = {}) {
  const pageErrors = [];
  const traceRequests = [];

  // Settled by the handlers below, only ever after they have recorded what they
  // saw. Waiting on page.waitForRequest instead would race the route handler:
  // the request event can resolve the wait before the handler stores the
  // payload, leaving a caller to assert against a not-yet-populated array.
  let finish;
  let timer;
  const settled = new Promise(resolve => {
    finish = resolve;
    timer = setTimeout(resolve, timeoutMs);
  });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on("pageerror", err => {
      pageErrors.push(err.message);
      finish();
    });

    await page.route("**/*", route => {
      const url = route.request().url();
      if (url === `${ORIGIN}/`) {
        return route.fulfill({
          contentType: "text/html",
          headers: { "Server-Timing": SERVER_TIMING },
          body: `<!doctype html><meta charset="utf-8"><title>rum smoke</title><script src="/rum.js"></script>`,
        });
      }
      if (url === `${ORIGIN}/rum.js`) {
        return route.fulfill({ contentType: "text/javascript", body: source });
      }
      if (TRACE_RE.test(url)) {
        traceRequests.push({
          url,
          method: route.request().method(),
          body: route.request().postData(),
        });
        finish();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        });
      }
      return route.fulfill({ status: 200, body: "" });
    });

    await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
    await settled;

    return { pageErrors, traceRequests };
  } finally {
    clearTimeout(timer);
    await browser.close();
  }
}

// Every span in the recorded OTLP/HTTP JSON exports, flattened out of the
// resource/scope nesting in send order.
export function exportedSpans(traceRequests) {
  const spans = [];
  for (const { body } of traceRequests) {
    if (!body) continue;
    for (const resource of JSON.parse(body).resourceSpans ?? []) {
      for (const scope of resource.scopeSpans ?? []) {
        spans.push(...(scope.spans ?? []));
      }
    }
  }
  return spans;
}

// Decode the attributes of every span named `spanName` out of the recorded
// OTLP/HTTP JSON exports, as a flat key -> value map. An OTLP AnyValue wraps its
// payload in exactly one typed field (stringValue, doubleValue, ...), so the
// sole value is the attribute value whatever its type.
export function spanAttributes(traceRequests, spanName) {
  const attributes = {};
  for (const span of exportedSpans(traceRequests)) {
    if (span.name !== spanName) continue;
    for (const { key, value } of span.attributes ?? []) {
      attributes[key] = Object.values(value)[0];
    }
  }
  return attributes;
}
