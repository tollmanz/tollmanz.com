import { test } from "node:test";
import assert from "node:assert/strict";
import { dateDisplay } from "../../filters/dates.js";

test("dateDisplay formats a JS Date as LLL dd, yyyy in UTC", () => {
  assert.equal(dateDisplay(new Date("2026-07-16T00:00:00Z")), "Jul 16, 2026");
});

test("dateDisplay uses UTC regardless of the input time of day", () => {
  assert.equal(dateDisplay(new Date("2026-01-05T23:30:00Z")), "Jan 05, 2026");
});

test("dateDisplay returns an empty string for null or undefined", () => {
  assert.equal(dateDisplay(null), "");
  assert.equal(dateDisplay(undefined), "");
});

test("dateDisplay returns an empty string for an invalid Date", () => {
  assert.equal(dateDisplay(new Date("not a date")), "");
});

test("dateDisplay returns an empty string for non-Date input", () => {
  assert.equal(dateDisplay("2026-07-16"), "");
  assert.equal(dateDisplay(1752624000000), "");
});
