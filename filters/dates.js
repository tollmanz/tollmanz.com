import { DateTime } from "luxon";

// Format a JS Date as "LLL dd, yyyy" in UTC (e.g. "Jul 16, 2026").
// Guards null/invalid input by returning an empty string instead of
// emitting Luxon's "Invalid DateTime" marker into the page.
export function dateDisplay(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) {
    return "";
  }
  return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("LLL dd, yyyy");
}
