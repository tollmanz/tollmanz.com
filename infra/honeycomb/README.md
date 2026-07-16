# Honeycomb infrastructure (Pulumi)

Honeycomb observability configuration for tollmanz.com, managed as code with
Pulumi on Pulumi Cloud. The Pulumi project is `tollmanz-com-honeycomb`; the stack
is `tollmanz-gmail-com/tollmanz-com-honeycomb/prod`. No secrets are committed.

This project manages:

- the `tollmanz-com` environment that holds production browser RUM, and the
  ingest API key the Fastly edge proxy uses to authenticate that telemetry
- a `tollmanz-com-local` environment for local RUM testing, isolated from prod,
  and its own ingest key (exported for local use; see below)

The dataset is not declared here. In Honeycomb's Environments and Services model
datasets are created on ingest, so the ingest key (with `createDatasets`) creates
it on the first telemetry it receives, named by the browser SDK's `serviceName`
(`tollmanz-com-web`).

Optionally, a curated Core Web Vitals board per environment (`tollmanz-com` and
`tollmanz-com-local`). Boards are v1 API resources managed through a second
provider authenticated with a v1 Configuration Key, each gated on its own stack
config flag (`manageProdBoard`, `manageLocalBoard`; default off). See "RUM
boards" below.

Triggers and SLOs are intentionally omitted for now. Like boards they are v1
resources, so they are a clean drop-in later using the same Configuration Key
providers the board tier adds.

## RUM boards

The board tier (issue #59) manages a compact Core Web Vitals board as code, one
per environment: five query panels, one per metric (LCP, INP, CLS, FCP, TTFB),
each a p75 over the last 7 days against the `tollmanz-com-web` dataset. It is a
hand-built board rather than an import of the sprawling UI template, whose panels
reference many UI-managed queries that `pulumi import` would leave unmanaged.

Boards, queries, and query annotations are Honeycomb v1 API resources. They need
a v1 Configuration Key scoped to one environment, not the v2 Management Key the
rest of this project uses. Two constraints shape how the keys are supplied:

- minting a configuration key from the Management Key fails on this plan
  (`access to this API is disabled: Error Creating Honeycomb API Key`), so each
  key is created by hand in the Honeycomb UI, not by a `honeycombio.ApiKey`
  resource
- enablement is gated on committed flags, not on env-var presence, so board state
  is deterministic across apply contexts: with one shared stack, keying on the
  env var would let a local apply create a board and a CI apply without the key
  delete it

Each environment has its own flag, config key, and board:

| Environment          | Flag               | Config key env var           | Board output      |
| -------------------- | ------------------ | ---------------------------- | ----------------- |
| `tollmanz-com`       | `manageProdBoard`  | `HONEYCOMB_CONFIG_KEY`       | `rumBoardIdProd`  |
| `tollmanz-com-local` | `manageLocalBoard` | `HONEYCOMB_LOCAL_CONFIG_KEY` | `rumBoardIdLocal` |

Prerequisite: the `tollmanz-com-web` dataset must already exist in the target
environment (that environment has received at least one RUM event), or query
creation fails with a dataset-not-found error. Prod has live RUM; for local, run
the site with `RUM_MODE=local` at least once first.

To enable a board (prod shown; substitute the local flag and key for local):

1. In the Honeycomb UI, switch to the target environment, open its settings ->
   API Keys, and create a Configuration Key. Grant it "Manage Queries and
   Columns" and "Manage Boards" (or full permissions). Copy the key.
2. Set the matching env var in the repo-root `.env` and add it as a GitHub
   Actions repository secret of the same name.
3. Turn the flag on for the stack, then apply:

   ```bash
   cd infra/honeycomb
   pulumi config set manageProdBoard true
   npm run up
   ```

The pre-existing manually-created `Real User Monitoring (RUM)` board
(`nUnmjid2hYb`, in `tollmanz-com-local`) is left untouched; delete it in the UI
once the managed board covers what you need.

## The prod ingest key never reaches the browser

The prod ingest key is exported as the secret stack output `ingestKey` and read
by the Fastly project through a Pulumi `StackReference`. Fastly injects it as the
`x-honeycomb-team` header on the `/v1/traces` edge proxy. The browser only ever
posts to the same-origin `/v1/traces` path with no credentials. See
`infra/fastly/`.

## Local testing environment

The `tollmanz-com-local` environment is isolated from prod, so local runs never
taint production data. Its ingest key is the secret output `localIngestKey`.
After `pulumi up`, read it and paste it into `HONEYCOMB_LOCAL_INGEST_KEY` in the
repo-root `.env`:

```bash
pulumi stack output localIngestKey --show-secrets
```

The local collector uses it to forward browser RUM to this environment alongside
Jaeger. See `local/otel/README.md`. Nothing about the local environment reaches
the deployed site.

## Secrets

The provider authenticates with a Honeycomb v2 Management Key pair:

| Variable                     | Used by                          | Source                                         |
| ---------------------------- | -------------------------------- | ---------------------------------------------- |
| `HONEYCOMB_KEY_ID`           | Honeycomb provider auth          | Management Key ID                              |
| `HONEYCOMB_KEY_SECRET`       | Honeycomb provider auth          | Management Key secret                          |
| `HONEYCOMB_CONFIG_KEY`       | Prod board (`manageProdBoard`)   | v1 Configuration Key, `tollmanz-com` env       |
| `HONEYCOMB_LOCAL_CONFIG_KEY` | Local board (`manageLocalBoard`) | v1 Configuration Key, `tollmanz-com-local` env |

Create the Management Key under Team settings -> API Keys -> Management Keys,
with these scopes:

- `environments:read` (refresh)
- `environments:write` (create and update the environment)
- `api-keys:write` (create the ingest key)

The `pulumi` scripts are wrapped with `dotenv -e ../../.env`, so locally they
read these from the single `.env` at the repo root:

```bash
cp .env.example .env   # at the repo root; edit with real values (gitignored)
cd infra/honeycomb
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
npm run preview   # dotenv -e ../../.env -- pulumi preview (dry run)
npm run up        # dotenv -e ../../.env -- pulumi up (apply)
npm run refresh   # dotenv -e ../../.env -- pulumi refresh (pull live state)
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
- `HONEYCOMB_CONFIG_KEY` (only once `manageProdBoard` is on)
- `HONEYCOMB_LOCAL_CONFIG_KEY` (only once `manageLocalBoard` is on)

## First apply

`pulumi up` cannot run here without your Pulumi Cloud and Honeycomb credentials,
so the first apply is yours to run. Verify the preview creates exactly one
environment and one ingest key, then apply.
