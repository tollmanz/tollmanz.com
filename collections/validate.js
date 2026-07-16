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

// Warn loudly and name the file instead of throwing: Eleventy already halts on
// truly fatal input, and a single malformed draft should not block the whole
// build. Returns the items unchanged so callers can validate inline.
export function validateCollection(items, label) {
  for (const problem of collectionProblems(items, label)) {
    console.warn(`[collections] ${problem}`);
  }
  return items;
}
