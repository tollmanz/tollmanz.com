# Docs

Reference documentation for tollmanz.com.

- [data.md](data.md): the `src/_data/` global data files, what each exposes to
  templates, and how build metadata and site validation work
- [edge-caching.md](edge-caching.md): how the site caches, compresses, and serves
  content at the Fastly edge in front of GitHub Pages, and why
- [edge-verification.md](edge-verification.md): the `tests/edge/` suite that
  verifies that contract against the live edge after every deploy
