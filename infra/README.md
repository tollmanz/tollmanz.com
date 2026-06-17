# Fastly infrastructure (Pulumi)

Fastly CDN configuration for tollmanz.com, managed as code with Pulumi on Pulumi
Cloud. State lives in Pulumi Cloud. No secrets are committed: the only credential
comes from the environment, from a gitignored `.env` locally and from a GitHub
Actions secret in CI.

The origin is GitHub Pages (`tollmanz.github.io`). Because GitHub Pages routes by
the HTTP Host header, the backend sends `Host: www.tollmanz.com` (the custom
domain configured on the repo) while doing TLS against the `tollmanz.github.io`
certificate. GitHub Pages is public, so the origin needs no request signing.

## Secrets

One value is required at run time:

| Variable         | Used by                        | Source                        |
| ---------------- | ------------------------------ | ----------------------------- |
| `FASTLY_API_KEY` | Fastly provider authentication | Fastly personal token (write) |

The `pulumi` scripts below are wrapped with `dotenv`, so locally they read this
from `infra/.env`. Copy the template and fill it in:

```bash
cd infra
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
to `main`, gated to `infra/**`). It does not use `.env`; it reads these GitHub
repository secrets:

- `PULUMI_ACCESS_TOKEN` (from https://app.pulumi.com, for non-interactive login)
- `FASTLY_API_KEY`

## How secrets stay out of the repo

The Fastly provider reads `FASTLY_API_KEY` from the environment. Nothing is
stored in `Pulumi.<stack>.yaml`. The token reaches Pulumi Cloud state (encrypted)
and the Fastly API, never the committed source.
