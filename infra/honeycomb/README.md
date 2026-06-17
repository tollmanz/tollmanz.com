# Honeycomb infrastructure (Pulumi)

Honeycomb observability configuration for tollmanz.com, managed as code with
Pulumi on Pulumi Cloud. The Pulumi project is `tollmanz-com-honeycomb`; the stack
is `tollmanz-gmail-com/tollmanz-com-honeycomb/prod`. No secrets are committed.

This project manages:

- the Honeycomb environment that holds browser RUM telemetry
- the ingest API key the Fastly edge proxy uses to authenticate that telemetry

The dataset is not declared here. In Honeycomb's Environments and Services model
datasets are created on ingest, so the ingest key (with `createDatasets`) creates
it on the first telemetry it receives, named by the browser SDK's `serviceName`
(`tollmanz-com-web`).

Triggers and SLOs are intentionally omitted for now. They need a configuration
key scoped to this environment rather than the team-level management key used
here, so they are a clean drop-in later: add a second provider configured with
that key and the trigger/SLO resources.

## The ingest key never reaches the browser

The ingest key is exported as the secret stack output `ingestKey` and read by the
Fastly project through a Pulumi `StackReference`. Fastly injects it as the
`x-honeycomb-team` header on the `/v1/traces` edge proxy. The browser only ever
posts to the same-origin `/v1/traces` path with no credentials. See
`infra/fastly/`.

## Secrets

The provider authenticates with a Honeycomb v2 Management Key pair:

| Variable               | Used by                 | Source                |
| ---------------------- | ----------------------- | --------------------- |
| `HONEYCOMB_KEY_ID`     | Honeycomb provider auth | Management Key ID     |
| `HONEYCOMB_KEY_SECRET` | Honeycomb provider auth | Management Key secret |

Create the Management Key under Team settings -> API Keys -> Management Keys,
with these scopes:

- `environments:read` (refresh)
- `environments:write` (create and update the environment)
- `api-keys:write` (create the ingest key)

The `pulumi` scripts are wrapped with `dotenv`, so locally they read these from
`infra/honeycomb/.env`:

```bash
cd infra/honeycomb
cp .env.example .env   # then edit .env with real values (gitignored)
pulumi install         # generates the bridged SDK (sdks/) and installs deps
```

First-time Pulumi auth (once per machine): `pulumi login`.

## Generated SDK

There is no native Pulumi Honeycomb provider, so the SDK is bridged from the
Honeycomb Terraform provider and declared in `Pulumi.yaml`:

```yaml
packages:
  honeycombio:
    source: pulumi/pulumi/terraform-provider
    version: 1.1.4
    parameters:
      - honeycombio/honeycombio
      - 0.51.0
```

`pulumi install` regenerates the SDK under `sdks/` (gitignored, ~68 MB). To bump
the Honeycomb provider, edit the `0.51.0` parameter and re-run `pulumi install`.

## Local workflow

```bash
npm run preview   # dotenv -- pulumi preview (dry run)
npm run up        # dotenv -- pulumi up (apply)
npm run refresh   # dotenv -- pulumi refresh (pull live state)
npm run format       # prettier --write .
npm run format:check # prettier --check .
```

After `npm run up`, the ingest key is available to the Fastly stack via the
StackReference; run the Fastly project next so the edge proxy picks it up. See
`infra/README.md` for the apply order.

## CI (GitHub Actions)

`.github/workflows/honeycomb.yml`: previews on PRs, applies on push to `main`,
gated to `infra/honeycomb/**`. It installs the Pulumi CLI, runs `pulumi install`
to regenerate the bridged SDK, then runs the Pulumi command. Required GitHub
repository secrets:

- `PULUMI_ACCESS_TOKEN`
- `HONEYCOMB_KEY_ID`
- `HONEYCOMB_KEY_SECRET`

## First apply

`pulumi up` cannot run here without your Pulumi Cloud and Honeycomb credentials,
so the first apply is yours to run. Verify the preview creates exactly one
environment and one ingest key, then apply.
