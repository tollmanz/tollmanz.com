# Deploy events

Deployments emit a marker so charts (currently Honeycomb) can annotate the
moment new content or infrastructure went live. The emitter is a small Node ESM
script run as the final step of each deploy workflow. No runtime dependencies:
Node 24's global `fetch` is enough.

```
scripts/deploy-events/
  emit.js              CLI entry: builds the event, dispatches to enabled sinks
  event.js             canonical event builder + validation
  adapters/
    honeycomb.js       maps the canonical event to a Honeycomb marker
tests/unit/deploy-events/  node --test unit tests (mocked fetch)
```

The harness reads `DEPLOY_EVENT_SINKS` (comma-separated) and dispatches the same
canonical event to each named adapter. Adding a vendor (Grafana annotations,
Datadog events) means adding one adapter file and a secret; nothing else changes.

## Canonical event

Vendor-neutral and versioned, built entirely from data the runner already has.
No vendor-specific fields appear here; adapters translate to their vendor API.

```json
{
  "schema_version": 1,
  "kind": "deployment",
  "timestamp": "2026-07-15T18:04:05Z",
  "service": "tollmanz.com",
  "environment": "production",
  "deployment": {
    "type": "site",
    "status": "succeeded",
    "revision": "b7d0a72c...",
    "revision_url": "https://github.com/tollmanz/tollmanz.com/commit/b7d0a72",
    "run_url": "https://github.com/tollmanz/tollmanz.com/actions/runs/123456",
    "actor": "tollmanz",
    "workflow": "Deploy to GitHub Pages",
    "summary": "site deploy b7d0a72 by tollmanz"
  }
}
```

| Field                     | Meaning                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `schema_version`          | Bumped only on a breaking shape change, so adapters evolve independently                     |
| `kind`                    | Event family; `deployment` today                                                             |
| `timestamp`               | RFC 3339, second precision; adapters convert as needed                                       |
| `service`                 | Logical service the deployment targets                                                       |
| `environment`             | Deploy environment; `production` today                                                       |
| `deployment.type`         | `site` or `infra`, mirroring the two pipelines                                               |
| `deployment.status`       | `succeeded` only for now; the field lets failed-deploy events be added without a schema bump |
| `deployment.revision`     | Full commit SHA                                                                              |
| `deployment.revision_url` | Link to the commit                                                                           |
| `deployment.run_url`      | Link to the Actions run                                                                      |
| `deployment.actor`        | Who triggered the run                                                                        |
| `deployment.workflow`     | Workflow name                                                                                |
| `deployment.summary`      | Human-readable one-liner                                                                     |

## Adapter contract

Each adapter exports:

- `name`: the sink name matched against `DEPLOY_EVENT_SINKS`
- `request(event, env)`: the vendor request it would send, for `--dry-run` and tests
- `async send(event, env)`: maps the event, reads its own secrets from `env`, and throws with a clear message on a non-2xx response

The harness runs adapters sequentially, reports per-adapter success or failure,
and exits non-zero if any sink fails.

## Honeycomb adapter

Maps the canonical event to a marker:
`POST https://api.honeycomb.io/1/markers/{dataset}`.

| Canonical field               | Honeycomb marker field                        |
| ----------------------------- | --------------------------------------------- |
| `deployment.summary`          | `message`                                     |
| `deploy-` + `deployment.type` | `type` (groups markers, controls chart color) |
| `timestamp` as Unix seconds   | `start_time`                                  |
| `deployment.run_url`          | `url`                                         |

Auth is `X-Honeycomb-Team` with a Configuration Key that has the Manage Markers
permission. Markers are environment-scoped by the key, so the key must belong to
the prod `tollmanz-com` environment that holds the target dataset; an ingest key
cannot create markers. That key is provisioned by Pulumi as the `markerKey`
output of `infra/honeycomb`; see its README for reading the value into the
`HONEYCOMB_API_KEY` secret. The dataset comes from `HONEYCOMB_DATASET`,
defaulting to `tollmanz-com-web` (the dataset receiving the site's RUM and Fastly
telemetry).

## Configuration

Referenced via environment only; nothing is stored in the repo.

| Name                 | Kind           | Purpose                                                                                    |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `DEPLOY_EVENT_SINKS` | repo variable  | Comma-separated adapter names, e.g. `honeycomb`                                            |
| `HONEYCOMB_DATASET`  | repo variable  | Marker dataset; defaults to `tollmanz-com-web`                                             |
| `HONEYCOMB_API_KEY`  | Actions secret | `markerKey` from `infra/honeycomb`: a `tollmanz-com` Configuration Key with Manage Markers |

## Local use

`--dry-run` prints the canonical payload and each adapter's mapped request
without sending. The GitHub Actions variables the builder reads must be present:

```sh
GITHUB_SHA=b7d0a72c GITHUB_REPOSITORY=tollmanz/tollmanz.com \
  GITHUB_RUN_ID=123456 GITHUB_ACTOR=tollmanz \
  GITHUB_WORKFLOW="Deploy to GitHub Pages" \
  DEPLOY_EVENT_SINKS=honeycomb \
  node scripts/deploy-events/emit.js --type=site --dry-run
```

Run the unit tests with `npm run test:unit`.

## Workflow integration

- `pages.yml`: a step after the Fastly purge in the `deploy` job, so the marker lands when the edge starts serving new content (`--type=site`)
- `infra.yml`: a step after `pulumi up`, guarded with `if: github.event_name != 'pull_request'` so PR previews never emit (`--type=infra`)

Both steps use `continue-on-error: true`: a vendor outage shows a red step
annotation but must not fail a deploy that already succeeded.
