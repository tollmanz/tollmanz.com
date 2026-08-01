// Bundles the browser RUM init (assets/rum/index.js) and the OpenTelemetry web
// SDK into build/js/rum.<hash>.js, which Eleventy passthrough-copies to
// /js/rum.<hash>.js. The hash is the bundle's own content hash, so the URL
// changes whenever the delivered bytes change and the edge serves it immutable
// (cache-control-fetch.vcl matches the .<hex>.js suffix). This mirrors the CSS
// fingerprinting in src/_data/assets.js; src/_data/rum.js finds the emitted
// file so the <script> reference and the bundle can never drift apart.
//
// Behaviour is chosen at build time from the environment:
//   RUM_MODE           "off" (default) | "local" | "production"
//   RUM_LOCAL_ENDPOINT  OTLP endpoint for the local collector (default localhost:4318)
//   RUM_SERVICE_NAME    service.name / Honeycomb dataset (default tollmanz-com-web)
//   RUM_SAMPLE_RATE     head-sampling divisor: N exports 1-in-N traces, 1 = 100%
//                       (default 1). The SDK stamps SampleRate so Honeycomb
//                       reweights counts. Must be a positive integer; anything
//                       else falls back to 1.
//
// When RUM_MODE is off (the default) nothing is built, so normal `npm run dev`
// and `npm run build` ship no RUM code. head.njk only emits the script tag when
// RUM is enabled (see src/_data/rum.js).

import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import { rm, mkdir, writeFile } from "node:fs/promises";

const mode = process.env.RUM_MODE ?? "off";
const localEndpoint = process.env.RUM_LOCAL_ENDPOINT ?? "http://localhost:4318";
const serviceName = process.env.RUM_SERVICE_NAME ?? "tollmanz-com-web";
const sampleRate = parseSampleRate(process.env.RUM_SAMPLE_RATE);

// Head sampling is deterministic and divisor-based: N exports 1-in-N traces and
// 1 keeps 100%. Only a positive integer is meaningful; unset, non-numeric, zero,
// negative, or fractional input falls back to 1 (no sampling) rather than
// silently dropping data.
function parseSampleRate(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

if (mode === "off") {
  // Clear any stale bundle from a previous enabled build.
  await rm("build/js", { recursive: true, force: true });
  console.log("RUM_MODE=off: skipping RUM bundle.");
  process.exit(0);
}

if (mode !== "local" && mode !== "production") {
  console.error(
    `Invalid RUM_MODE "${mode}". Use "off", "local", or "production".`
  );
  process.exit(1);
}

// Start clean so exactly one hashed bundle exists; stale hashes from previous
// builds would otherwise accumulate and get copied into the site output.
await rm("build/js", { recursive: true, force: true });
await mkdir("build/js", { recursive: true });

const result = await esbuild.build({
  entryPoints: ["assets/rum/index.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: "build/js/rum.js",
  legalComments: "none",
  write: false,
  define: {
    "process.env.RUM_MODE": JSON.stringify(mode),
    "process.env.RUM_LOCAL_ENDPOINT": JSON.stringify(localEndpoint),
    "process.env.RUM_SERVICE_NAME": JSON.stringify(serviceName),
    "process.env.RUM_SAMPLE_RATE": JSON.stringify(sampleRate),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

// Hash the output rather than the source: the delivered bytes also change with
// dependency and esbuild upgrades, and the URL must change with them.
const bundle = result.outputFiles[0];
const hash = createHash("sha256")
  .update(bundle.contents)
  .digest("hex")
  .slice(0, 12);
const outfile = `build/js/rum.${hash}.js`;
await writeFile(outfile, bundle.contents);

console.log(
  `Built ${outfile} (RUM_MODE=${mode}, service=${serviceName}, ` +
    `sampleRate=${sampleRate}` +
    (mode === "local" ? `, endpoint=${localEndpoint}` : "") +
    ")."
);
