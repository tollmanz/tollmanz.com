// Bundles the browser RUM init (assets/rum/index.js) and the OpenTelemetry web
// SDK into build/js/rum.js, which Eleventy passthrough-copies to /js/rum.js.
//
// Behaviour is chosen at build time from the environment:
//   RUM_MODE           "off" (default) | "local" | "production"
//   RUM_LOCAL_ENDPOINT  OTLP endpoint for local SigNoz (default localhost:4318)
//   RUM_SERVICE_NAME    service.name / Honeycomb dataset (default tollmanz-com-web)
//
// When RUM_MODE is off (the default) nothing is built, so normal `npm run dev`
// and `npm run build` ship no RUM code. head.njk only emits the script tag when
// RUM is enabled (see src/_data/rum.js).

import * as esbuild from "esbuild";
import { rm, mkdir } from "node:fs/promises";

const mode = process.env.RUM_MODE ?? "off";
const localEndpoint = process.env.RUM_LOCAL_ENDPOINT ?? "http://localhost:4318";
const serviceName = process.env.RUM_SERVICE_NAME ?? "tollmanz-com-web";

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

await mkdir("build/js", { recursive: true });

await esbuild.build({
  entryPoints: ["assets/rum/index.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: "build/js/rum.js",
  legalComments: "none",
  define: {
    "process.env.RUM_MODE": JSON.stringify(mode),
    "process.env.RUM_LOCAL_ENDPOINT": JSON.stringify(localEndpoint),
    "process.env.RUM_SERVICE_NAME": JSON.stringify(serviceName),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

console.log(
  `Built build/js/rum.js (RUM_MODE=${mode}, service=${serviceName}` +
    (mode === "local" ? `, endpoint=${localEndpoint}` : "") +
    ")."
);
