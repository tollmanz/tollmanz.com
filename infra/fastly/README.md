# Fastly infrastructure (Pulumi)

Fastly CDN configuration for tollmanz.com, managed as code with Pulumi on Pulumi
Cloud. State lives in Pulumi Cloud. No secrets are committed.

The Pulumi project name is `tollmanz-com-infra` (the stack is
`tollmanz-gmail-com/tollmanz-com-infra/prod`). The directory is `infra/fastly/`
for symmetry with the Honeycomb project, but the cloud project name is kept as-is
to avoid a state migration on the protected service.

The origin is GitHub Pages (`tollmanz.github.io`). Because GitHub Pages routes by
the HTTP Host header, the backend sends `Host: www.tollmanz.com` (the custom
domain configured on the repo) while doing TLS against the `tollmanz.github.io`
certificate. GitHub Pages is public, so the origin needs no request signing.

## RUM proxy to Honeycomb

This service also fronts browser RUM. The site posts OpenTelemetry traces to the
same-origin path `/v1/traces`. A VCL snippet routes that path to a Honeycomb
backend and sets the `x-honeycomb-team` header from the Honeycomb ingest key, so
the key never ships to the browser and there is no CORS (the request is
same-origin). The proxy snippet runs ahead of the apex-to-www redirect, and the
telemetry POST passes straight through without caching.

The ingest key is not configured here. It is created by the Honeycomb Pulumi
project and read at apply time through a Pulumi `StackReference` to
`tollmanz-gmail-com/tollmanz-com-honeycomb/prod`. Bring up the Honeycomb stack
first; see `infra/README.md` for the apply order.

## Secrets

One value is required at run time:

| Variable         | Used by                        | Source                        |
| ---------------- | ------------------------------ | ----------------------------- |
| `FASTLY_API_KEY` | Fastly provider authentication | Fastly personal token (write) |

The Honeycomb ingest key is not in this list: it arrives via the StackReference,
so this project needs no Honeycomb credentials.

The `pulumi` scripts below are wrapped with `dotenv`, so locally they read this
from `infra/fastly/.env`. Copy the template and fill it in:

```bash
cd infra/fastly
npm install
cp .env.example .env   # then edit .env with real values (gitignored)
```

Create the Fastly token at
https://manage.fastly.com/account/personal/tokens with write access to the
service.

## Local workflow

```bash
npm run preview   # dotenv -- pulumi preview (dry run)
npm run up        # dotenv -- pulumi up (apply; new active version on real changes)
npm run refresh   # dotenv -- pulumi refresh (pull live state)
npm run format       # prettier --write .
npm run format:check # prettier --check .
```

First-time Pulumi auth (once per machine): `pulumi login`.

## CI (GitHub Actions)

CI is defined in `.github/workflows/infra.yml` (previews on PRs, applies on push
to `main`, gated to `infra/fastly/**`). It does not use `.env`; it reads these
GitHub repository secrets:

- `PULUMI_ACCESS_TOKEN` (from https://app.pulumi.com, for non-interactive login;
  also grants read access to the Honeycomb stack's outputs via the
  StackReference)
- `FASTLY_API_KEY`

## How secrets stay out of the repo

The Fastly provider reads `FASTLY_API_KEY` from the environment. The Honeycomb
ingest key is read as a secret output of the Honeycomb stack. Nothing is stored
in `Pulumi.<stack>.yaml`. The values reach Pulumi Cloud state (encrypted) and the
Fastly API (where the header injection runs), never the committed source.
