import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRegression,
  RELATIVE_THRESHOLD,
  ABSOLUTE_FLOOR_MS,
} from "../../scripts/build-perf.mjs";

test("no baseline yields a no-baseline status", () => {
  const result = evaluateRegression(5000, null);
  assert.equal(result.status, "no-baseline");
  assert.equal(result.regressed, false);
});

test("non-positive baseline is treated as missing", () => {
  assert.equal(evaluateRegression(5000, 0).status, "no-baseline");
  assert.equal(evaluateRegression(5000, -10).status, "no-baseline");
});

test("a faster build is within threshold", () => {
  const result = evaluateRegression(2000, 4000);
  assert.equal(result.status, "ok");
  assert.equal(result.regressed, false);
  assert.equal(result.deltaMs, -2000);
});

test("a small relative jump under the absolute floor is not a regression", () => {
  // 500ms -> 900ms is +80% but only +400ms, below the absolute floor.
  const result = evaluateRegression(900, 500);
  assert.equal(result.regressed, false);
  assert.equal(result.status, "ok");
});

test("a large absolute jump within the relative threshold is not a regression", () => {
  // 10s -> 14s is +4s but only +40%, below the relative threshold.
  const result = evaluateRegression(14000, 10000);
  assert.equal(result.regressed, false);
});

test("crossing both thresholds is a regression", () => {
  // 3s -> 6s is +100% and +3s.
  const result = evaluateRegression(6000, 3000);
  assert.equal(result.status, "regressed");
  assert.equal(result.regressed, true);
  assert.equal(result.deltaMs, 3000);
  assert.equal(result.deltaPct, 1);
});

test("thresholds are configurable", () => {
  const result = evaluateRegression(1200, 1000, {
    relativeThreshold: 0.1,
    absoluteFloorMs: 100,
  });
  assert.equal(result.regressed, true);
});

test("exported defaults are sane", () => {
  assert.equal(RELATIVE_THRESHOLD, 0.5);
  assert.equal(ABSOLUTE_FLOOR_MS, 1000);
});
