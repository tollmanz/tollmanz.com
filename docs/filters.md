# Filters

Eleventy custom filters live in `filters/`, grouped by concern. One module per
category exports plain, testable functions; `filters/index.js` exports
`registerFilters(eleventyConfig)`, which `eleventy.config.js` calls to register
them all.

| Filter          | Module               | Purpose                                                |
| --------------- | -------------------- | ------------------------------------------------------ |
| `dateDisplay`   | `filters/dates.js`   | Format a JS Date as `LLL dd, yyyy` in UTC              |
| `head`          | `filters/arrays.js`  | First `n` items of an array (last `\|n\|` if negative) |
| `hasCodeBlocks` | `filters/content.js` | True when content contains Prism-highlighted code      |

Each filter guards bad input: `dateDisplay` returns `""` for null/invalid
dates, `head` returns `[]` for non-array or non-numeric `n`, and
`hasCodeBlocks` returns `false` for non-string input.

## Adding a filter

1. Add the function to the matching module under `filters/` (or create a new one)
2. Register it in `filters/index.js`
3. Add unit tests under `tests/unit/`

Run the filter tests with `npm run test:unit`.
