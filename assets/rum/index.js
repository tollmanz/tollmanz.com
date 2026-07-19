import {
  HoneycombWebSDK,
  WebVitalsInstrumentation,
} from "@honeycombio/opentelemetry-web";
import { getWebAutoInstrumentations } from "@opentelemetry/auto-instrumentations-web";

// Build-time configuration, replaced by esbuild `define` (see
// scripts/build-rum.mjs). RUM_MODE is "off", "local", or "production".
const mode = process.env.RUM_MODE;
const localEndpoint = process.env.RUM_LOCAL_ENDPOINT;
const serviceName = process.env.RUM_SERVICE_NAME;

// Copy the navigation's Server-Timing metrics onto a span as attributes. The
// Fastly edge emits `origin` and `edge` metrics (backend vs edge processing
// time), which the browser parses onto the navigation PerformanceEntry as
// entry.serverTiming: an array of { name, duration, description }. This maps
// each metric generically to server_timing.<name>.{duration_ms,description}, so
// adding a metric in the VCL needs no change here. duration is exposed in full
// because the header is same-origin; on a cache hit the origin metric is absent
// or 0, which is the honest signal that the backend did no work.
function addServerTimingAttributes(span) {
  const [navigation] = performance.getEntriesByType("navigation");
  const metrics = navigation?.serverTiming;
  if (!metrics) return;
  for (const metric of metrics) {
    if (typeof metric.duration === "number") {
      span.setAttribute(
        `server_timing.${metric.name}.duration_ms`,
        metric.duration
      );
    }
    if (metric.description) {
      span.setAttribute(
        `server_timing.${metric.name}.description`,
        metric.description
      );
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
    skipOptionsValidation: true,
    instrumentations: [
      getWebAutoInstrumentations({
        "@opentelemetry/instrumentation-fetch": { ignoreUrls },
        "@opentelemetry/instrumentation-xml-http-request": { ignoreUrls },
        // Attach the Server-Timing metrics the Fastly edge emits (backend vs
        // edge processing time; see infra/fastly/snippets/server-timing-deliver.vcl)
        // to the document-fetch span, which is the span for the navigation
        // request the header describes.
        "@opentelemetry/instrumentation-document-load": {
          applyCustomAttributesOnSpan: {
            documentFetch: addServerTimingAttributes,
          },
        },
      }),
      new WebVitalsInstrumentation(),
    ],
  });

  sdk.start();
}
