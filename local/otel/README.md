# Local trace backend (RUM testing only)

A one-command OpenTelemetry Collector plus Jaeger UI for eyeballing the site's
RUM traces before pointing anything at Honeycomb. Local only: nothing here is
deployed, and no API key is involved. The collector receives the same OTLP the
browser would send to production, so what you see locally is what production
sends.

Why a collector in front of Jaeger: the browser posts cross-origin, which needs
CORS on the OTLP HTTP receiver. The collector's config owns that (see
`collector-config.yaml`) and forwards to Jaeger server-to-server.

## Run it

Prerequisite: Docker (with Compose). From this directory:

```bash
docker compose up -d
```

This exposes:

- Jaeger UI on http://localhost:16686
- OTLP/HTTP ingest on `localhost:4318` (where the browser posts)

## Point the site at it

From the repo root, run the dev server in local RUM mode:

```bash
RUM_MODE=local pnpm run dev
```

`RUM_MODE=local` bundles the RUM init pointed at `http://localhost:4318` (the
collector; override with `RUM_LOCAL_ENDPOINT`) and makes `head.njk` emit the
script tag. Eleventy serves on http://localhost:8080, which is the origin the
collector's CORS config allows. No port juggling: Jaeger's UI is on 16686, so it
does not clash with the dev server.

Load http://localhost:8080, click around a few pages, then open the Jaeger UI,
pick the `tollmanz-com-web` service, and Find Traces. Page-load, Web Vitals, and
fetch/xhr spans show up within a few seconds.

## Preview in Honeycomb instead of Jaeger (optional)

To see the spans in the real Honeycomb experience before deploying, without
touching prod data, forward them to a separate Honeycomb environment. The
collector adds the ingest key and sends to Honeycomb, exactly as Fastly does in
prod, so the key stays out of the browser. Jaeger keeps receiving too.

The `tollmanz-com-local` environment and its ingest key are managed by the
Honeycomb Pulumi project (`infra/honeycomb`), isolated from prod. Get the key
from the stack rather than the Honeycomb UI:

```bash
cd infra/honeycomb
pulumi stack output localIngestKey --show-secrets   # after `pnpm run up`
```

Then set two values in the repo-root `.env` (copy `.env.example` at the repo
root if it does not exist yet): `HONEYCOMB_LOCAL_INGEST_KEY` to that key, and
`OTEL_COLLECTOR_CONFIG=collector-config-honeycomb.yaml` to select the
Honeycomb-enabled collector config. Then start compose with that env file:

```bash
cd local/otel
docker compose --env-file ../../.env up -d   # or restart collector if already up
```

Browse the site as usual, then open Honeycomb, switch to the
`tollmanz-com-local` environment, and the `tollmanz-com-web` dataset appears
with the same page-load, Web Vitals, and interaction data prod would send.
Honeycomb groups it by `session.id` and `page.url`, so a page view reads as one
unit even though it is several traces.

The ingest key lives only in the repo-root `.env` (gitignored) and the
collector, never in the site bundle.

## Teardown

```bash
docker compose down        # add -v to also drop stored telemetry
```

## If nothing shows up

Open the browser devtools Network tab and look for the POST to
`localhost:4318/v1/traces`:

- a failed CORS preflight (the OPTIONS request) means the collector's
  `allowed_origins` does not exactly match the dev server origin. If you served
  on a non-default port, update `collector-config.yaml` and
  `docker compose restart collector`
- no request at all means `RUM_MODE` was not set, so the bundle no-op'd. `build:js`
  runs once at dev startup, so after editing `assets/rum/index.js` restart the
  dev command

As a backend-side check, `docker compose logs collector` prints a per-batch
summary when spans arrive, independent of the browser and the UI.
