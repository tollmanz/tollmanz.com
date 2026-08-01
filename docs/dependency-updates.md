# Dependency updates

How Dependabot is configured for this repository, why it deviates from the
defaults, and the one setting that cannot live in version control.

## What went wrong on the defaults

Before `.github/dependabot.yml` existed, Dependabot ran entirely on GitHub
defaults: no manifest configuration, `dependabot_security_updates` disabled, and
GitHub's preset auto-triage rule "dismiss low-impact alerts for
development-scoped dependencies" active.

Two advisories were dismissed by that rule with `auto_dismissed_at` set and
`dismissed_reason` null, meaning no person made the call:

| Alert | Package               | Severity | Scope       | Auto-dismissed       |
| ----- | --------------------- | -------- | ----------- | -------------------- |
| 96    | `liquidjs`            | high     | development | 2026-07-28T09:30:25Z |
| 85    | `@opentelemetry/core` | medium   | development | 2026-07-15T21:03:36Z |

Neither appeared on the alerts page, so the remediation round in #81, #82, and
#83 reported a clean board while both were live in `package-lock.json`. They
surfaced only because `npm audit` was run by hand.

The rule governs most of the traffic this repository sees: of 88 lifetime
alerts, 76 were development-scoped and 12 runtime.

## npm scope is not blast radius

Every dependency in the root `package.json` is a devDependency. Two of them are
not development-only in any meaningful sense:

- `@honeycombio/opentelemetry-web` and `@opentelemetry/auto-instrumentations-web`
  are imported by `assets/rum/index.js`, bundled by `scripts/build-rum.mjs` into
  `/js/rum.<hash>.js`, and served to visitors by `head.njk` whenever `RUM_MODE`
  is `local` or `production`
- `liquidjs` is reached through `@11ty/eleventy` and genuinely runs at build
  time, so a compromise costs a local build rather than a visitor

The distinction drives the configuration. The browser-bound subset gets its own
group so its upgrades are reviewed as browser changes, and the auto-triage
preset must stay off because it cannot tell the two cases apart. Turning it off
is a manual step; see "Settings that are not in this file" below.

## Configuration in this repository

`.github/dependabot.yml` covers both npm projects:

| Project       | Directory       | Interval | Version-update groups                          |
| ------------- | --------------- | -------- | ---------------------------------------------- |
| Eleventy site | `/`             | weekly   | `browser-runtime`, `eleventy`, `build-tooling` |
| Fastly Pulumi | `/infra/fastly` | monthly  | `pulumi`, `infra-tooling`                      |

Each project also defines a `security` group with
`applies-to: security-updates`, collapsing all patchable advisories in that
lockfile into one pull request.

Grouping is load-bearing rather than cosmetic. Each project resolves to a single
lockfile, so one pull request per update produces N branches that all rewrite the
same file and conflict with each other on merge. #83 collapsed 13 alerts into one
in-range lockfile change; ungrouped, that would have been 13 mutually conflicting
branches.

Pull requests against the root project that touch `package-lock.json` trigger
`.github/workflows/rum-smoke.yml`, which executes the built RUM bundle in
headless Chromium. Browser-runtime upgrades are therefore smoke-tested before
merge without any extra wiring.

## Settings that are not in this file

GitHub exposes no REST or GraphQL API for auto-triage rules, so the first item
below is a manual toggle that has to be re-checked by hand.

| Setting                                                                     | Required state | Where                                                       |
| --------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| Preset rule "Dismiss low impact alerts for development-scoped dependencies" | off            | Settings > Advanced Security > Dependabot rules             |
| Dependabot alerts                                                           | enabled        | `GET /repos/tollmanz/tollmanz.com/vulnerability-alerts`     |
| Dependabot security updates                                                 | enabled        | `PUT /repos/tollmanz/tollmanz.com/automated-security-fixes` |

Security updates are enabled because the `security` groups give them a workable
shape. With them on, Dependabot opens a pull request for every open alert that
has a patch, so patchable advisories arrive as work rather than as a page nobody
visits.

Verify the two API-backed settings with:

```sh
gh api repos/tollmanz/tollmanz.com/automated-security-fixes
gh api -i repos/tollmanz/tollmanz.com/vulnerability-alerts | head -1
```

Verify the preset rule by checking that no alert carries `auto_dismissed_at`:

```sh
gh api repos/tollmanz/tollmanz.com/dependabot/alerts --paginate \
  --jq '.[] | select(.auto_dismissed_at) | {number, package: .dependency.package.name}'
```

## What is deliberately not covered

- `infra/honeycomb` has no committed lockfile and its `package.json` pins
  `@pulumi/honeycombio` to `file:sdks/honeycombio`, a tree that
  `pulumi install` regenerates from `Pulumi.yaml`. Dependabot cannot resolve
  that path, so adding the directory would only produce failing update runs
- the `github-actions` ecosystem is not managed here. Workflow action versions
  are bumped by hand
