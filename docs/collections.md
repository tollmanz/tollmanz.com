# Collections

Eleventy content collections live in `collections/`. `collections/index.js`
exports `registerCollections(eleventyConfig)`, which `eleventy.config.js` calls
to register them all; `collections/validate.js` holds the front-matter checks
and `collections/backlinks.js` the post-to-talk index, both as plain, testable
functions.

| Collection       | Source           | Shape                                    |
| ---------------- | ---------------- | ---------------------------------------- |
| `posts`          | `src/posts/*.md` | Items sorted newest first by date        |
| `pages`          | `src/pages/*.md` | Items in default (file) order            |
| `talks`          | `src/talks/*.md` | Items sorted newest first by date        |
| `talkBacklinks`  | `src/talks/*.md` | `{ postUrl: [talk, ...] }` reverse index |
| `collectionMeta` | the three globs  | `{ posts, pages, talks }` item counts    |

`collectionMeta` exists for templates that need a count without re-globbing,
e.g. `{{ collections.collectionMeta.posts }}`.

`talkBacklinks` inverts the `sources` entries a talk declares with
kind `writing`: each such URL is normalized to the path form Eleventy uses for
`page.url` and mapped to the talks that cite it. `src/_includes/post.njk` looks
the current page up in it and renders a note linking back to the talk, so the
relationship is declared once, on the talk. URLs on another origin are skipped
because they cannot name a post on this site.

Talks also render individual pages under `/speaking/`, but that permalink comes
from `src/talks/talks.11tydata.js`, not from the collection. The collection
drives the speaking index, its facet counts, and related-talk ranking.

## Validation

Each item in `posts`, `pages`, and `talks` is checked for the required
front-matter fields `title` and `date`. A missing or empty value emits a
`console.warn` naming the file; an unparseable `date` warns as well. Talks get
the extra taxonomy checks described in [talks.md](talks.md). Validation warns
rather than throws so a single malformed draft cannot block the build. Eleventy
still fails hard on genuinely fatal input.

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
