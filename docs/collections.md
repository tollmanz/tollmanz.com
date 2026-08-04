# Collections

Eleventy content collections live in `collections/`. `collections/index.js`
exports `registerCollections(eleventyConfig)`, which `eleventy.config.js` calls
to register them all; `collections/validate.js` holds the front-matter checks as
plain, testable functions.

| Collection       | Source           | Shape                                 |
| ---------------- | ---------------- | ------------------------------------- |
| `posts`          | `src/posts/*.md` | Items sorted newest first by date     |
| `pages`          | `src/pages/*.md` | Items in default (file) order         |
| `talks`          | `src/talks/*.md` | Items sorted newest first by date     |
| `collectionMeta` | all three globs  | `{ posts, pages, talks }` item counts |

`collectionMeta` exists for templates that need a count without re-globbing,
e.g. `{{ collections.collectionMeta.posts }}`.

Talks also render individual pages under `/speaking/`, but that permalink comes
from `src/talks/talks.11tydata.js`, not from the collection. The collection
drives the speaking index, its facet counts, and related-talk ranking.

## Validation

Each item in `posts`, `pages`, and `talks` is checked for the required
front-matter fields `title` and `date`. A missing or empty value emits a
`console.warn` naming the file; an unparseable `date` warns as well. Validation
warns rather than throws so a single malformed draft cannot block the build.
Eleventy still fails hard on genuinely fatal input.

Collection construction is wrapped in `try`/`catch`: on an unexpected error the
collection degrades to an empty value with a `console.error` instead of crashing
the build.

## Scope

Collections carry metadata and validation only. They do not create tag or
category archive pages or any new URLs. The `categories` front-matter field on
posts stays internal and is not surfaced publicly.

## Adding a collection

1. Register it in `collections/index.js`, wrapped in `buildCollection` so a
   failure degrades instead of crashing the build
2. Extend `collections/validate.js` if it needs new front-matter checks
3. Add unit tests under `tests/unit/`

Run the collection tests with `npm run test:unit`.
