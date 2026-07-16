# Docs

Reference documentation for tollmanz.com.

- [data.md](data.md): the `src/_data/` global data files, what each exposes to
  templates, and how build metadata and site validation work
- [filters.md](filters.md): the `filters/` Eleventy custom filters, what each
  does, and how to add one
- [collections.md](collections.md): the `collections/` Eleventy collections,
  what each exposes to templates, and their front-matter validation rules
- [edge-caching.md](edge-caching.md): how the site caches, compresses, and serves
  content at the Fastly edge in front of GitHub Pages, and why
- [edge-verification.md](edge-verification.md): the `tests/edge/` suite that
  verifies that contract against the live edge after every deploy
