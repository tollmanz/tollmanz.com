# Local SigNoz (RUM testing only)

A local OpenTelemetry backend for eyeballing the site's RUM traces before they go
to Honeycomb. This is local-only: nothing here is deployed, and no API key is
involved. SigNoz ingests the same OTLP traces Honeycomb does, so what you see
locally is what production sends.

## Run SigNoz

SigNoz ships its own Docker Compose stack. Clone it and bring it up:

```bash
git clone -b main https://github.com/SigNoz/signoz.git
cd signoz/deploy/docker
docker compose up -d
```

This exposes:

- SigNoz UI on http://localhost:8080
- OTLP ingestion on `localhost:4317` (gRPC) and `localhost:4318` (HTTP)

The browser SDK uses OTLP/HTTP, so port 4318 is the one that matters.

## Enable CORS on the collector

The browser posts traces directly to the collector, so its OTLP HTTP receiver
must allow the dev server's origin or the preflight fails and no spans arrive.
Edit the collector config in the SigNoz checkout (the OTLP receiver, in
`deploy/docker/otel-collector-config.yaml` or equivalent for your version) to add
a `cors` block:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins:
            - http://localhost:8081
```

Then restart the collector: `docker compose restart otel-collector`.

`http://localhost:8081` is the site's dev origin (see below). It must match
exactly, scheme and port included.

## Point the site at SigNoz

SigNoz's UI and Eleventy both default to port 8080, so serve the site on 8081 to
avoid the clash. From the repo root:

```bash
RUM_MODE=local npm run dev -- --port=8081
```

`RUM_MODE=local` makes `build:js` bundle the RUM init pointed at
`http://localhost:4318` (override with `RUM_LOCAL_ENDPOINT`), and Eleventy serves
the site on 8081. Load http://localhost:8081, click around, then open the SigNoz
UI and find the `tollmanz-com-web` service. Page loads, Web Vitals, and
fetch/XHR spans show up within a few seconds.

JavaScript changes are bundled by `build:js`, which runs once at startup. After
editing `assets/rum/index.js`, restart the dev command to rebuild.

## Teardown

```bash
cd signoz/deploy/docker
docker compose down        # add -v to also drop stored telemetry
```
