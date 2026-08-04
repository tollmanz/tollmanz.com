import { DATE_PRECISIONS } from "../filters/dates.js";
import {
  isKnownEventType,
  isKnownSourceKind,
  isKnownTalkType,
  isKnownTopic,
} from "../taxonomy/talks.js";

// Front-matter fields every content item needs. Templates and feeds render
// title, url, and date (index list, sitemap, RSS), so a missing value ships
// broken output rather than failing the build.
export const REQUIRED_FIELDS = ["title", "date"];

// Return a list of human-readable problems with the given collection items,
// each naming the offending file. Pure: the caller decides how to report.
export function collectionProblems(items, label) {
  const problems = [];

  if (!Array.isArray(items)) {
    return problems;
  }

  for (const item of items) {
    const inputPath = item?.inputPath ?? "(unknown file)";
    const data = item?.data ?? {};

    for (const field of REQUIRED_FIELDS) {
      const value = data[field];
      if (value === undefined || value === null || value === "") {
        problems.push(
          `${label}: "${inputPath}" is missing required front-matter ` +
            `field "${field}"`
        );
      }
    }

    const { date } = data;
    if (
      date !== undefined &&
      date !== null &&
      date !== "" &&
      Number.isNaN(new Date(date).getTime())
    ) {
      problems.push(`${label}: "${inputPath}" has an invalid date value`);
    }
  }

  return problems;
}

// Talks classify themselves in front matter instead of having their type and
// topics inferred from prose, so every slug is checked against the taxonomy.
// A typo would otherwise reach the page as a bare slug and silently fall out of
// the filter facets and related-talk ranking.
export function talkProblems(items, label) {
  const problems = [];

  if (!Array.isArray(items)) {
    return problems;
  }

  for (const item of items) {
    const inputPath = item?.inputPath ?? "(unknown file)";
    const data = item?.data ?? {};
    const problem = message =>
      problems.push(`${label}: "${inputPath}" ${message}`);

    if (!isKnownTalkType(data.type)) {
      problems.push(
        `${label}: "${inputPath}" has an unknown type "${data.type}"`
      );
    }

    if (
      data.datePrecision !== undefined &&
      !DATE_PRECISIONS.includes(data.datePrecision)
    ) {
      problem(`has an unknown datePrecision "${data.datePrecision}"`);
    }

    if (!Array.isArray(data.topics) || data.topics.length === 0) {
      problem('is missing required front-matter field "topics"');
    } else {
      for (const slug of data.topics) {
        if (!isKnownTopic(slug)) {
          problem(`lists an unknown topic "${slug}"`);
        }
      }
    }

    if (!data.event?.name) {
      problem('is missing required front-matter field "event.name"');
    }
    if (!isKnownEventType(data.event?.type)) {
      problem(`has an unknown event type "${data.event?.type}"`);
    }

    for (const source of data.sources ?? []) {
      // `label` predates the { publisher, title } split and still supplies the
      // link text, so either field satisfies the check.
      if (!source?.url || !(source?.title || source?.label)) {
        problem("has a source without a title or url");
      } else if (!isKnownSourceKind(source.kind)) {
        problem(`has a source with an unknown kind "${source.kind}"`);
      }
    }

    // The index reads `featured` as a flag, so a string or a number would opt a
    // talk in on truthiness alone and silently widen the shortlist.
    if (data.featured !== undefined && typeof data.featured !== "boolean") {
      problem(`has a non-boolean "featured" value "${data.featured}"`);
    }

    for (const field of ["video", "slides"]) {
      if (data[field] && !data[field].url) {
        problem(`has a "${field}" block without a url`);
      }
    }
  }

  return problems;
}

// Warn loudly and name the file instead of throwing: Eleventy already halts on
// truly fatal input, and a single malformed draft should not block the whole
// build. Extra per-collection checks run alongside the shared ones. Returns the
// items unchanged so callers can validate inline.
export function validateCollection(items, label, ...extraChecks) {
  const checks = [collectionProblems, ...extraChecks];
  for (const check of checks) {
    for (const problem of check(items, label)) {
      console.warn(`[collections] ${problem}`);
    }
  }
  return items;
}
