# Infrastructure (Pulumi)

Infrastructure for tollmanz.com, managed as code with Pulumi on Pulumi Cloud.
One Pulumi project per service, each with its own state, stack, credentials, and
CI workflow, so changes to one service neither diff nor block the other.

| Project   | Directory    | Pulumi project name      | Manages                                                                    |
| --------- | ------------ | ------------------------ | -------------------------------------------------------------------------- |
| Fastly    | `fastly/`    | `tollmanz-com-infra`     | CDN over GitHub Pages, the `/v1/traces` RUM proxy to Honeycomb             |
| Honeycomb | `honeycomb/` | `tollmanz-com-honeycomb` | `tollmanz-com` and `tollmanz-com-local` environments and their ingest keys |

The site is built by Eleventy and published to GitHub Pages; Fastly fronts it as
the CDN and TLS terminator and also proxies browser RUM to Honeycomb.

The Fastly project name stays `tollmanz-com-infra` (not `tollmanz-com-fastly`)
on purpose: the live stack and its protected service already exist under that
name, and a rename would rewrite resource URNs in state. The directory is
`fastly/` for symmetry; the cloud project name is left alone.

## Cross-service dependency

The RUM ingest key is created by the Honeycomb project and consumed by the
Fastly project through a Pulumi `StackReference`. The browser never carries the
key; Fastly injects it into the `/v1/traces` proxy at the edge.

The key lives in the Fastly service's write-only `secrets` edge dictionary; a
command resource in the Fastly project upserts it there on apply. Apply order
matters: bring up Honeycomb first, then Fastly. The order is not destructive,
just lazy: if Fastly runs while the Honeycomb stack has no `ingestKey` output
yet, the dictionary stays empty, the proxy snippet's lookup falls through to
the origin, and the next Fastly run after Honeycomb is up fills the dictionary
and activates the proxy. Until the `HONEYCOMB_KEY_ID` / `HONEYCOMB_KEY_SECRET`
repository secrets are set, the Honeycomb CI workflow skips its Pulumi steps
with a notice instead of failing.

```bash
cd honeycomb && pulumi install && npm run up   # honeycomb uses npm (see below)
cd ../fastly && pnpm run up
```

In CI the two projects have separate path-gated workflows
(`.github/workflows/honeycomb.yml`, `.github/workflows/infra.yml`). After a
change that rotates the ingest key, the Fastly workflow has to run to pick up
the new value.

The repo uses pnpm, but the Honeycomb project stays on npm. `pulumi install`
links its bridged `@pulumi/honeycombio` file: SDK by running
`pkg set dependencies.@pulumi/honeycombio=...`, and pnpm's `pkg set` rejects the
`@` in the property path (`ERR_PNPM_UNEXPECTED_TOKEN_IN_PROPERTY_PATH`). npm sets
the scoped key without complaint. The Fastly project pulls its providers from the
npm registry with no local SDK, so it runs on pnpm like the rest of the repo.

## Secrets

All local secrets live in a single `.env` at the repo root (gitignored); each
project's `pulumi` npm/pnpm scripts load it with `dotenv -e ../../.env`. Copy
`.env.example` at the repo root to `.env` and fill it in. CI never reads `.env`;
it uses GitHub Actions repository secrets. See each project's README for which
variables it needs.
