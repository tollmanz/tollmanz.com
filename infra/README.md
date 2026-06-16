# Fastly infrastructure (Pulumi)

Fastly CDN configuration for tollmanz.com, managed as code with Pulumi on Pulumi
Cloud. State lives in Pulumi Cloud. No secrets are committed: all credentials
come from the environment, from a gitignored `.env` locally and from GitHub
Actions secrets in CI.

## Secrets

Three values are required at run time:

| Variable                | Used by                        | Source                          |
| ----------------------- | ------------------------------ | ------------------------------- |
| `FASTLY_API_KEY`        | Fastly provider authentication | Fastly personal token (write)   |
| `B2_APPLICATION_KEY_ID` | B2 signing snippet (keyID)     | Backblaze B2 application key id |
| `B2_APPLICATION_KEY`    | B2 signing snippet (appKey)    | Backblaze B2 application key    |

The two `B2_*` variables are the same Backblaze key pair the content-deploy
workflow already uses, so the names are shared rather than duplicated.

The `pulumi` scripts below are wrapped with `dotenv`, so locally they read these
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
npm run format    # prettier --check .
npm run format:fix
```

First-time Pulumi auth (once per machine): `pulumi login`.

## CI (GitHub Actions)

CI is defined in `.github/workflows/infra.yml` (previews on PRs, applies on push
to `main`, gated to `infra/**`). It does not use `.env`; it reads these GitHub
repository secrets:

- `PULUMI_ACCESS_TOKEN` (from https://app.pulumi.com, for non-interactive login)
- `FASTLY_API_KEY`
- `B2_APPLICATION_KEY_ID`
- `B2_APPLICATION_KEY`

## How secrets stay out of the repo

`index.ts` reads `B2_APPLICATION_KEY_ID` / `B2_APPLICATION_KEY` from
`process.env` and wraps
them with `pulumi.secret()`. The Fastly provider reads `FASTLY_API_KEY` from the
environment. Nothing is stored in `Pulumi.<stack>.yaml`. The values still reach
Fastly (where the signing runs) and Pulumi Cloud state (encrypted), never the
committed source.
