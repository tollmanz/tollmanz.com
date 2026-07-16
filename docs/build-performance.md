# Build performance

How build timing is measured, reported, and guarded against regressions.

## What is tracked

Two things run on every build:

- Per-template metrics come from the [Eleventy Directory Output
  plugin](https://www.11ty.dev/docs/plugins/directory-output/), enabled in
  `eleventy.config.js`. It groups Eleventy's per-file output by directory and
  prints each template's output size and render time. Quiet mode is on so this
  table is the single build report rather than a duplicate of Eleventy's default
  per-file logging. Any output larger than 200 kB is highlighted.
- Total build time is measured by `scripts/build-perf.mjs`, which also compares
  the run against the committed baseline and writes a JSON metrics artifact.

## Reading the directory-output table

Each row is `output path`, `input template`, `output size`, `render time`:

```
→ about/index.html    src/pages/about.md    10.0kB    8.1ms
```

Large sizes or render times point at the templates worth optimizing first. The
feed (`src/feed.njk`) is expected to be the largest output because it inlines
every post.

## Total build time and regression check

`scripts/build-perf.mjs` records the Eleventy build duration and compares it to
`perf/build-baseline.json`.

- `npm run perf` runs the Eleventy build, times it, and prints the comparison
- In CI the build is timed once in the `Build site` step, and the duration is
  passed to the report step via `BUILD_PERF_DURATION_MS` so no second build runs
- The result is written to the GitHub Actions job summary as a table
- The per-run metrics land in `perf/build-metrics.json` (gitignored locally,
  uploaded as the `build-metrics` artifact in CI)

A run is flagged as a regression only when it is slower than the baseline by
both more than 50% and more than one second. The absolute floor stops sub-second
jitter on a fast build from tripping the alert. Both thresholds are constants at
the top of `scripts/build-perf.mjs`.

A regression is a warning by default: it is surfaced in the job summary and as a
`::warning::` annotation, but the deploy still proceeds. Set
`BUILD_PERF_FAIL_ON_REGRESSION=1` to make the report step exit non-zero and fail
the build instead.

### Why a committed baseline

GitHub Pages builds have no shared storage between runs, so there is no free
place to persist a rolling history. The committed `perf/build-baseline.json` is
the pragmatic stand-in: one number in the repo, compared against on every run.
The tradeoff is that the baseline is a fixed reference rather than a trend, and
it drifts as the site grows until refreshed.

## Updating the baseline

Refresh the baseline when the build's steady-state time changes for a legitimate
reason (more posts, a new plugin, a toolchain bump), so the check tracks real
regressions rather than expected growth.

- From a local warm build: `node scripts/build-perf.mjs --update-baseline`
- From CI: read the build time in a run's job summary and set `buildMs` in
  `perf/build-baseline.json` to that value

CI hardware differs from a local machine, so prefer a CI-reported number for the
committed baseline. The initial baseline is a seed and should be refreshed from
the first CI run.
