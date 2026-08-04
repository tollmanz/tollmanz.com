import { DateTime } from "luxon";

// Every date filter formats in UTC and guards null/invalid input by returning
// an empty string, so a malformed front-matter date renders as nothing instead
// of Luxon's "Invalid DateTime" marker.
function format(dateObj, pattern) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) {
    return "";
  }
  return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(pattern);
}

// Format a JS Date as "LLL dd, yyyy" in UTC (e.g. "Jul 16, 2026").
export function dateDisplay(dateObj) {
  return format(dateObj, "LLL dd, yyyy");
}

// Machine-readable date for <time datetime="..."> attributes.
export function htmlDateString(dateObj) {
  return format(dateObj, "yyyy-LL-dd");
}

// Year only, for the large numeral on speaking index rows.
export function year(dateObj) {
  return format(dateObj, "yyyy");
}

// Month and day; the speaking index renders the year separately.
export function monthDay(dateObj) {
  return format(dateObj, "LLL dd");
}
