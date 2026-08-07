import { HoneycombWebSDK } from "@honeycombio/opentelemetry-web";
import { getWebAutoInstrumentations } from "@opentelemetry/auto-instrumentations-web";

// Build-time configuration, replaced by esbuild `define` (see
// scripts/build-rum.mjs). RUM_MODE is "off", "local", or "production".
const mode = process.env.RUM_MODE;
const localEndpoint = process.env.RUM_LOCAL_ENDPOINT;
const serviceName = process.env.RUM_SERVICE_NAME;
// Head-sampling divisor: N exports 1-in-N traces, 1 = 100%. Validated to a
// positive integer at build time (see scripts/build-rum.mjs).
const sampleRate = process.env.RUM_SAMPLE_RATE;

// Copy the navigation's Server-Timing metrics onto a span as attributes. The
// browser parses the header onto the navigation PerformanceEntry as
// entry.serverTiming: an array of { name, duration, description }. The Fastly
// edge emits one metric per field, naming each for what it describes rather than
// for the node that measured it (see
// infra/fastly/snippets/server-timing-deliver.vcl), so the mapping here stays
// generic and a new field in the VCL needs no change to this file:
//
//   pop;desc=LHR      -> fastly.pop = "LHR"
//   total;dur=42.1    -> fastly.total_ms = 42.1
//
// Durations are exposed in full because the header is same-origin. `backend` is
// absent whenever the edge answered from its own cache, which is the honest
// signal that no backend work happened on this request.
function addServerTimingAttributes(span) {
  const [navigation] = performance.getEntriesByType("navigation");
  const metrics = navigation?.serverTiming;
  if (!metrics) return;
  for (const metric of metrics) {
    // `duration` is specified as 0 when the metric carries no dur param, which
    // is every description-only field, so only a positive value is a real
    // measurement. A typeof check would pass for all of them.
    if (metric.duration > 0) {
      span.setAttribute(`fastly.${metric.name}_ms`, metric.duration);
    }
    if (metric.description) {
      span.setAttribute(`fastly.${metric.name}`, metric.description);
    }
  }
}

if (mode !== "off") {
  // local: post to the local OTLP collector (see local/otel).
  // production: post to the same-origin /v1/traces path, which the Fastly edge
  // proxy authenticates to Honeycomb. No API key is ever present in the browser,
  // so skipOptionsValidation tells the SDK not to require one.
  const endpoint = mode === "local" ? localEndpoint : window.location.origin;

  // Do not instrument the telemetry export itself, or each export would create
  // spans that trigger more exports.
  const ignoreUrls = [/\/v1\/traces(\?|$)/];

  const sdk = new HoneycombWebSDK({
    endpoint,
    serviceName,
    sampleRate,
    skipOptionsValidation: true,
    // Core Web Vitals are deliberately absent from this list.
    // HoneycombWebSDK appends its own WebVitalsInstrumentation unless
    // `webVitalsInstrumentationConfig.enabled` is false, so naming it here too
    // registers two instances. Both observe the same web-vitals callbacks and
    // both emit a span, which silently doubles every LCP/CLS/INP/FCP/TTFB
    // event. P75 survives that (duplicating every sample preserves
    // percentiles) but every COUNT does not, so rating breakdowns and
    // per-page-view counts read 2x. Leave vitals to the SDK.
    instrumentations: [
      getWebAutoInstrumentations({
        "@opentelemetry/instrumentation-fetch": { ignoreUrls },
        "@opentelemetry/instrumentation-xml-http-request": { ignoreUrls },
        // Attach the Server-Timing fields the Fastly edge emits (POP, cache
        // status and timings; see
        // infra/fastly/snippets/server-timing-deliver.vcl) to the document-fetch
        // span, which is the span for the navigation request the header
        // describes.
        "@opentelemetry/instrumentation-document-load": {
          applyCustomAttributesOnSpan: {
            documentFetch: addServerTimingAttributes,
          },
        },
      }),
    ],
  });

  sdk.start();
}
