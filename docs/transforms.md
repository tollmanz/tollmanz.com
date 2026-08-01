# Transforms

Eleventy output transforms live in `transforms/`, one ESM module per transform.
`transforms/index.js` exports `registerTransforms(eleventyConfig)`, which
`eleventy.config.js` calls to register them all.

| Transform | Module                  | Purpose                                           |
| --------- | ----------------------- | ------------------------------------------------- |
| `htmlmin` | `transforms/htmlmin.js` | Minify `.html` output with `html-minifier-terser` |
| `cssmin`  | `transforms/cssmin.js`  | Minify `.css` output with `clean-css`             |

Each transform inspects `this.page.outputPath` and returns non-matching output
unchanged, so ordering against other transforms does not matter.

## Conditional application

Minification runs for production builds only. `registerTransforms` registers
nothing unless `process.env.ELEVENTY_RUN_MODE === "build"`, which Eleventy sets
to `build` for `npm run build` and to `serve`/`watch` for `npm run dev`.
Skipping minification during dev keeps rebuilds fast and output readable.

## Error handling

Each transform guards its work in try/catch. On failure it logs a
`console.warn` and returns the original, unminified content, so one bad page or
stylesheet degrades output rather than breaking the build. `cssmin` also treats
a non-empty `result.errors` from clean-css as a failure and falls back the same
way.

## Adding a transform

1. Add a module under `transforms/` that exports the transform function
2. Register it in `transforms/index.js`
3. Add unit tests under `tests/unit/`

Run the transform tests with `npm run test:unit`.
