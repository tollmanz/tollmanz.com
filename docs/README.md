# Docs

Reference documentation for tollmanz.com.

- [edge-caching.md](edge-caching.md): how the site caches, compresses, and serves
  content at the Fastly edge in front of GitHub Pages, and why
- [edge-verification.md](edge-verification.md): the `tests/edge/` suite that
  verifies that contract against the live edge after every deploy
- [build-performance.md](build-performance.md): how per-template and total build
  metrics are measured, reported in CI, and guarded against regressions
