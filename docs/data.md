# Global data

Eleventy loads every file in `src/_data/` as global data, keyed by filename, and
exposes it to all templates through the [data
cascade](https://www.11ty.dev/docs/data-cascade/). Each file owns one purpose so
the data a template needs is easy to find and hard to break.

## Files

| File        | Global   | Purpose                                                          |
| ----------- | -------- | ---------------------------------------------------------------- |
| `site.js`   | `site`   | Static site identity: title, description, URL, author            |
| `assets.js` | `assets` | Content-hashed CSS URLs (single source of truth for `<link>`s)   |
| `rum.js`    | `rum`    | Real user monitoring toggle and bundle URL, driven by `RUM_MODE` |
| `build.js`  | `build`  | Build timestamp, version, commit, and environment                |

Data files are JavaScript (ESM) rather than JSON so they can compute values at
build time: `assets.js` hashes files, `rum.js` finds the built bundle, `build.js`
reads git and the environment, and `site.js` validates its own fields.

## `site`

Static identity used across `head.njk`, `footer.njk`, `feed.njk`, `sitemap.njk`,
and `robots.njk`.

| Key               | Type   | Notes                                    |
| ----------------- | ------ | ---------------------------------------- |
| `title`           | string | Site name and title suffix               |
| `description`     | string | Default meta/OG description              |
| `url`             | string | Canonical origin, used to build abs URLs |
| `author.name`     | string | Feed author, credited in metadata        |
| `author.email`    | string | Feed author email                        |
| `author.github`   | string | GitHub handle for the footer link        |
| `author.mastodon` | string | Mastodon profile URL (`rel="me"`)        |

`site.js` validates the critical fields (`title`, `description`, `url`,
`author.name`, `author.email`) at build time. Problems are reported with
`console.warn` prefixed `[site data]` rather than throwing, so a typo never
blocks a deploy. `url` must parse as an absolute http(s) URL.

## `build`

Provenance for the current build, computed once and identical on every page.

| Key           | Type           | Notes                                                |
| ------------- | -------------- | ---------------------------------------------------- |
| `time`        | string         | ISO 8601 timestamp of the build                      |
| `version`     | string         | `version` from `package.json`                        |
| `sha`         | string \| null | Short commit SHA, or `null` when git is unavailable  |
| `environment` | string         | `"production"` or `"development"`                    |
| `production`  | boolean        | `true` when `environment` is `"production"`          |
| `label`       | string         | `"1.0.0 (abc1234)"`, or just `"1.0.0"` without a SHA |

The SHA resolves in order: `GITHUB_SHA` (set by GitHub Actions), then
`git rev-parse --short HEAD` for local builds, then `null`. The environment is
`production` in GitHub Actions and `development` otherwise; set `ELEVENTY_ENV` to
override.

`head.njk` surfaces `build.label` and `build.time` as non-visual `<meta name>`
tags. They survive HTML minification (comments do not) and make it easy to
confirm which build is live.
