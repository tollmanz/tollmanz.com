import { DateTime } from "luxon";

// How exactly a date is known. Talks sort by an exact JS Date, but some
// engagements (an on-demand recording, say) only have a month or a year behind
// them, and the page should not claim a day it cannot support.
const PRECISIONS = {
  day: { display: "LLL dd, yyyy", machine: "yyyy-LL-dd", short: "LLL dd" },
  month: { display: "LLL yyyy", machine: "yyyy-LL", short: "LLL" },
  year: { display: "yyyy", machine: "yyyy", short: "" },
};

export const DATE_PRECISIONS = Object.keys(PRECISIONS);

// Every date filter formats in UTC and guards null/invalid input by returning
// an empty string, so a malformed front-matter date renders as nothing instead
// of Luxon's "Invalid DateTime" marker. An unknown precision falls back to the
// full date rather than hiding information.
function format(dateObj, precision, key) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) {
    return "";
  }
  const pattern = (PRECISIONS[precision] || PRECISIONS.day)[key];
  if (!pattern) {
    return "";
  }
  return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(pattern);
}

// Format a JS Date as "LLL dd, yyyy" in UTC (e.g. "Jul 16, 2026"), or coarser
// when the date is only known to the month or the year.
export function dateDisplay(dateObj, precision) {
  return format(dateObj, precision, "display");
}

// Machine-readable date for <time datetime="..."> attributes. Coarse
// precisions emit the shorter forms the HTML spec allows: "2014-06", "2014".
export function htmlDateString(dateObj, precision) {
  return format(dateObj, precision, "machine");
}

// Year only, for the large numeral on speaking index rows.
export function year(dateObj) {
  return format(dateObj, "year", "display");
}

// Month and day; the speaking index renders the year separately. Empty when
// only the year is known, so the row shows the numeral and nothing else.
export function monthDay(dateObj, precision) {
  return format(dateObj, precision, "short");
}
