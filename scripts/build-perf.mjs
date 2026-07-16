// Build performance tracking for the Eleventy build.
//
// Measures (or receives) the Eleventy build duration, writes a JSON metrics
// artifact, and compares the duration against the committed baseline in
// perf/build-baseline.json. A regression beyond the threshold is surfaced as a
// warning (non-blocking by default) and written to the GitHub Actions job
// summary. See docs/build-performance.md.
//
// Usage:
//   node scripts/build-perf.mjs                 # build, time it, then report
//   node scripts/build-perf.mjs --duration 3200 # report a pre-measured time
//   node scripts/build-perf.mjs --update-baseline
//
// Env:
//   BUILD_PERF_DURATION_MS       alternative to --duration
//   BUILD_PERF_FAIL_ON_REGRESSION=1  exit non-zero on a regression
//   GITHUB_STEP_SUMMARY          when set, a markdown summary is appended

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = path.join(ROOT, "perf", "build-baseline.json");
const METRICS_PATH = path.join(ROOT, "perf", "build-metrics.json");

// A regression is only flagged when the build is both meaningfully slower in
// relative terms and slower by an absolute margin. The absolute floor keeps
// sub-second jitter on a fast build from tripping the alert.
export const RELATIVE_THRESHOLD = 0.5; // +50%
export const ABSOLUTE_FLOOR_MS = 1000; // ignore deltas under 1s

// Compare a build duration against the baseline. Pure so it can be unit tested.
export function evaluateRegression(currentMs, baselineMs, opts = {}) {
  const relativeThreshold = opts.relativeThreshold ?? RELATIVE_THRESHOLD;
  const absoluteFloorMs = opts.absoluteFloorMs ?? ABSOLUTE_FLOOR_MS;

  if (typeof baselineMs !== "number" || !(baselineMs > 0)) {
    return {
      status: "no-baseline",
      regressed: false,
      deltaMs: null,
      deltaPct: null,
    };
  }

  const deltaMs = currentMs - baselineMs;
  const deltaPct = deltaMs / baselineMs;
  const regressed = deltaPct > relativeThreshold && deltaMs > absoluteFloorMs;

  return {
    status: regressed ? "regressed" : "ok",
    regressed,
    deltaMs,
    deltaPct,
  };
}

function parseArgs(argv) {
  const args = { duration: null, updateBaseline: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--duration") {
      args.duration = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--update-baseline") {
      args.updateBaseline = true;
    }
  }
  return args;
}

function readBaseline() {
  try {
    const raw = fs.readFileSync(BASELINE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Run the Eleventy build and return its wall-clock duration in milliseconds.
function measureBuild() {
  const start = process.hrtime.bigint();
  const result = spawnSync("npx", ["@11ty/eleventy"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });
  const end = process.hrtime.bigint();
  if (result.status !== 0) {
    throw new Error(`Eleventy build failed with exit code ${result.status}`);
  }
  return Number((end - start) / 1000000n);
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatDelta(evaluation) {
  if (evaluation.status === "no-baseline") {
    return "no baseline";
  }
  const sign = evaluation.deltaMs >= 0 ? "+" : "";
  const pct = (evaluation.deltaPct * 100).toFixed(1);
  return `${sign}${formatSeconds(evaluation.deltaMs)} (${sign}${pct}%)`;
}

function writeSummary(metrics, baseline, evaluation) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;

  const baselineCell = baseline ? formatSeconds(baseline.buildMs) : "n/a";
  const statusLabel = {
    ok: "✅ within threshold",
    regressed: "⚠️ regression",
    "no-baseline": "ℹ️ no baseline",
  }[evaluation.status];

  const lines = [
    "## Build performance",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Build time | ${formatSeconds(metrics.buildMs)} |`,
    `| Baseline | ${baselineCell} |`,
    `| Delta | ${formatDelta(evaluation)} |`,
    `| Threshold | +${(RELATIVE_THRESHOLD * 100).toFixed(0)}% and +${formatSeconds(ABSOLUTE_FLOOR_MS)} |`,
    `| Status | ${statusLabel} |`,
    "",
  ];
  fs.appendFileSync(file, lines.join("\n") + "\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const envDuration = process.env.BUILD_PERF_DURATION_MS;
  let buildMs;
  if (args.duration != null && !Number.isNaN(args.duration)) {
    buildMs = args.duration;
  } else if (envDuration && !Number.isNaN(Number(envDuration))) {
    buildMs = Number(envDuration);
  } else {
    buildMs = measureBuild();
  }

  const metrics = {
    buildMs: Math.round(buildMs),
    recordedAt: new Date().toISOString(),
    node: process.version,
  };

  fs.mkdirSync(path.dirname(METRICS_PATH), { recursive: true });
  fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2) + "\n");

  const baseline = readBaseline();

  if (args.updateBaseline) {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(metrics, null, 2) + "\n");
    console.log(`Baseline updated: ${formatSeconds(metrics.buildMs)}`);
    return;
  }

  const evaluation = evaluateRegression(metrics.buildMs, baseline?.buildMs);
  writeSummary(metrics, baseline, evaluation);

  console.log(`Build time: ${formatSeconds(metrics.buildMs)}`);
  if (baseline) {
    console.log(`Baseline:   ${formatSeconds(baseline.buildMs)}`);
    console.log(`Delta:      ${formatDelta(evaluation)}`);
  } else {
    console.log("Baseline:   none (run with --update-baseline to create one)");
  }

  if (evaluation.regressed) {
    const message = `Build time regressed by ${formatDelta(evaluation)} versus baseline ${formatSeconds(baseline.buildMs)}`;
    // GitHub Actions annotation; harmless as plain output elsewhere.
    console.log(`::warning title=Build performance regression::${message}`);
    if (process.env.BUILD_PERF_FAIL_ON_REGRESSION === "1") {
      process.exitCode = 1;
    }
  }
}

// Only run the CLI when invoked directly, so the pure helpers can be imported
// by tests without side effects.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
