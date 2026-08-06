import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dateDisplay,
  htmlDateString,
  monthDay,
  year,
} from "../../filters/dates.js";

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

test("htmlDateString formats a JS Date as yyyy-LL-dd in UTC", () => {
  assert.equal(htmlDateString(new Date("2026-07-16T23:30:00Z")), "2026-07-16");
});

test("year and monthDay split the date for speaking index rows", () => {
  const date = new Date("2015-12-04T00:00:00Z");
  assert.equal(year(date), "2015");
  assert.equal(monthDay(date), "Dec 04");
});

test("every date filter returns an empty string for invalid input", () => {
  for (const filter of [dateDisplay, htmlDateString, year, monthDay]) {
    assert.equal(filter(null), "");
    assert.equal(filter(new Date("not a date")), "");
    assert.equal(filter("2026-07-16"), "");
  }
});

test("a month-precision date drops the day everywhere it renders", () => {
  const date = new Date("2014-06-01T00:00:00Z");
  assert.equal(dateDisplay(date, "month"), "Jun 2014");
  assert.equal(htmlDateString(date, "month"), "2014-06");
  assert.equal(monthDay(date, "month"), "Jun");
});

test("a year-precision date renders only the year", () => {
  const date = new Date("2014-06-01T00:00:00Z");
  assert.equal(dateDisplay(date, "year"), "2014");
  assert.equal(htmlDateString(date, "year"), "2014");
  assert.equal(monthDay(date, "year"), "");
});

test("an unknown precision falls back to the full date", () => {
  const date = new Date("2014-06-01T00:00:00Z");
  assert.equal(dateDisplay(date, "decade"), "Jun 01, 2014");
  assert.equal(htmlDateString(date, "decade"), "2014-06-01");
});

test("year ignores the precision, since the numeral always shows", () => {
  assert.equal(year(new Date("2014-06-01T00:00:00Z"), "year"), "2014");
});
