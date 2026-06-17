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

if (mode !== "off") {
  // local: post to a SigNoz collector on localhost.
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
      }),
      new WebVitalsInstrumentation(),
    ],
  });

  sdk.start();
}
