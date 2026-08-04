# Filters

Eleventy custom filters live in `filters/`, grouped by concern. One module per
category exports plain, testable functions; `filters/index.js` exports
`registerFilters(eleventyConfig)`, which `eleventy.config.js` calls to register
them all.

| Filter           | Module               | Purpose                                                |
| ---------------- | -------------------- | ------------------------------------------------------ |
| `dateDisplay`    | `filters/dates.js`   | Format a JS Date as `LLL dd, yyyy` in UTC              |
| `htmlDateString` | `filters/dates.js`   | Format a JS Date as `yyyy-LL-dd` for `<time datetime>` |
| `year`           | `filters/dates.js`   | Year only, for speaking index rows                     |
| `monthDay`       | `filters/dates.js`   | Month and day, for speaking index rows                 |
| `head`           | `filters/arrays.js`  | First `n` items of an array (last `\|n\|` if negative) |
| `hasCodeBlocks`  | `filters/content.js` | True when content contains Prism-highlighted code      |
| `paragraphs`     | `filters/content.js` | Split a front-matter string into paragraphs            |
| `talkType`       | `filters/talks.js`   | `{ slug, label }` for a talk's type slug               |
| `talkTopics`     | `filters/talks.js`   | `{ slug, label }` for a talk's topic slugs             |
| `talkEventType`  | `filters/talks.js`   | `{ slug, label }` for an event type slug               |
| `sourceGroups`   | `filters/talks.js`   | Group source links by their declared kind              |
| `topicFacets`    | `filters/talks.js`   | `{ slug, label, count }` topic filter chips            |
| `eventFacets`    | `filters/talks.js`   | `{ slug, label, count }` event filter chips            |
| `eventFacetSlug` | `filters/talks.js`   | Event type slug to the facet slug its chip filters on  |
| `speakingStats`  | `filters/talks.js`   | Headline counts for the speaking hero                  |
| `relatedTalks`   | `filters/talks.js`   | Up to `limit` talks ranked by series and shared topics |

Each filter guards bad input: the date filters return `""` for null or invalid
dates, `head` returns `[]` for non-array or non-numeric `n`, `hasCodeBlocks`
returns `false` for non-string input, and the talk filters tolerate missing
front matter rather than throwing mid-build.

## Adding a filter

1. Add the function to the matching module under `filters/` (or create a new one)
2. Register it in `filters/index.js`
3. Add unit tests under `tests/unit/`

Run the filter tests with `npm run test:unit`.
