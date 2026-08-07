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

## Boards

Two boards are managed as code against the `tollmanz-com-web` dataset:

| Board                        | Environments   | Question it answers                   |
| ---------------------------- | -------------- | ------------------------------------- |
| `Real User Monitoring (RUM)` | prod and local | What are the numbers                  |
| `Core Web Vitals triage`     | prod and local | Which pages miss a threshold, and why |

## RUM board

The board tier (issue #59) manages the `Real User Monitoring (RUM)` board as
code, one per environment, in two sections against the `tollmanz-com-web`
dataset:

| Section         | Panels | Window                  | Content                                                  |
| --------------- | ------ | ----------------------- | -------------------------------------------------------- |
| Core Web Vitals | 5      | 7 day p75               | LCP, INP, CLS, FCP, TTFB, the window Google reports over |
| RUM overview    | 9      | 2 hour, 10s granularity | Ported from the hand-made template board (see below)     |

A full-width Markdown text panel titles each section, and every panel carries an
explicit position on Honeycomb's 12 column grid, so the layout is deterministic
rather than whatever order the API returns. The vitals sit on top, three to a
row; the overview section below keeps the template board's own arrangement.

The overview queries are reproduced as managed `Query` and `QueryAnnotation`
resources rather than referenced by ID, so this board does not depend on any
UI-owned query. That is also why it is hand-built rather than a `pulumi import`
of the template board, whose panels pointed at queries import would have left
unmanaged.

Seven of the nine overview queries are reproduced verbatim. Two were corrected,
because the template was written for a generic web app rather than this one:

- `Slowest Pages by Document Fetch` was `Slowest Requests by Endpoint`, filtering
  `name` to fetch and XHR spans (`HTTP GET` and friends). This site makes no fetch
  or XHR calls at all, and the RUM exporter's own request is excluded from
  instrumentation, so nothing ever matched and the panel was permanently empty. It
  now measures `documentFetch`, the navigation request, by `page.route`
- `Top Landing Pages by Page Load` was `Top Landing Pages by Session Count`. The
  Honeycomb web SDK mints a session id once per document with no persistence, so
  every navigation on this multi-page site starts a new session. The query counts
  document loads, and `COUNT_DISTINCT(session.id)` would return the same figure, so
  only the label was wrong

## Core Web Vitals triage board

`Core Web Vitals triage` answers the question the RUM board does not: which
pages miss a Core Web Vitals threshold, and why. Seven sections, 22 query
panels, a 7 day window throughout:

| Section                     | Content                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| 1. Which pages miss         | Offender table and rating mix per metric, by `page.route`           |
| 2. Why LCP misses           | The four LCP phases per route, the LCP element, phase trend         |
| 3. Why CLS misses           | `cls.largest_shift_target` (the element that moved), and load state |
| 4. Why INP misses           | The three INP phases per route, and the interaction behind them     |
| 5. Server time and delivery | TTFB phases, plus Fastly cache outcome and POP from `documentFetch` |
| 6. Who is affected          | Vitals split by device type, network type, and browser              |
| 7. Drill into one page view | Worst individual views, keyed by `session.id`                       |

Four properties of this telemetry shape the design. All four were verified by
running the built bundle in headless Chromium and reading the exported OTLP
payload, and against the live prod schema.

- **Every web vital is its own single-span trace.** `WebVitalsInstrumentation`
  starts a span with no parent when the metric finalizes, long after
  `documentLoad` ended, so LCP, CLS, INP, FCP and TTFB each land as a root span
  in a trace of their own. One page view is spread across about six traces and
  no trace waterfall contains all of it
- **`session.id` is the join key.** The SDK mints it once per document with no
  persistence, so on this multi-page site one session id is exactly one page
  view, and it is stamped on every span in every one of those traces. Section 7
  exists because of this: take a `session.id` from a table and query
  `session.id = <id>` to get every span that page view produced
- **`page.route` is on every span**, added by the SDK's
  `BrowserAttributesSpanProcessor` on span start, so vitals break down per page
- **Resource attributes are flattened onto every event** by Honeycomb, so
  `device.type`, `network.effectiveType` and `browser.name` segment vitals for
  free

The one thing that does not compose: `fastly.*` exists only on `documentFetch`
spans and `ttfb.*` only on `TTFB` spans. Honeycomb has no join and these are
different spans in different traces, so edge cache outcome cannot be broken down
by TTFB in one query. Section 5 keeps them as neighbouring panels instead.

Panels filter on `<metric>.rating` rather than a hand-written millisecond
threshold, so Google's boundaries cannot drift out of sync here. It also
sidesteps a data bug: `cls.value` was an `integer` column in prod for a while
and truncated every score to zero, but `cls.rating` is computed in the browser
from the true float and is correct across that period.

Panels count page views with `COUNT_DISTINCT(session.id)`, not spans. Every
vital reports at most once per page view, so the two agree on correct data, but
a span count reads 2x for any window reaching back before the duplicate
instrumentation fix (see below).

### Local builds it too, as a staging copy

Both environments build this board, so a change can be rehearsed in
`tollmanz-com-local` before it reaches prod.

That takes a deliberate step. Ten of the 33 columns the board queries had never
been seen by local ingest, and Honeycomb validates every column when a saved
query is created (`missing unknown column or derived column "<name>"`), so those
queries could not be created there. The ten are declared as `honeycombio.Column`
resources in `LOCAL_STAGING_COLUMNS`, with the types prod inferred.

Declaring a column is not seeding it. `POST /1/columns` creates the column
empty, so nothing here fabricates telemetry and no panel shows invented data:
the affected sections render empty until real events arrive. Seeding, when it is
wanted, stays a separate deliberate act.

Pulumi cannot infer that a query depends on a column, because a query names its
columns inside an opaque JSON string rather than through a resource reference.
The triage queries carry an explicit `dependsOn` on the declared columns.

Prod declares nothing, since ingest created all 33 columns there already.

Two caveats on how faithful the staging copy is. The five `fastly.*` columns
stay empty locally for good, because nothing in the local stack sits behind
Fastly and those values come from the edge's Server-Timing header; the five
`inp.*` fields do fill in once local browsing produces a qualifying interaction.
And three columns have drifted in type between the environments, because each
was created by ingest independently and typed from its first value:

| Column                  | Local     | Prod      |
| ----------------------- | --------- | --------- |
| `inp.value`             | `float`   | `integer` |
| `ttfb.request_duration` | `integer` | `float`   |
| `cls.delta`             | `float`   | `integer` |

`float` is correct in all three cases, since each is fractional. None is used by
either board, so they are left alone, but a query that reads them can behave
differently in the two environments. Fix with
`PUT /1/columns/<dataset>/<id>`, which governs later writes only.

### Web vitals were recorded twice until 2026-08-07

`HoneycombWebSDK` appends its own `WebVitalsInstrumentation` unless
`webVitalsInstrumentationConfig.enabled` is false. `assets/rum/index.js` also
named it in `instrumentations`, so two instances were registered, both observed
the same web-vitals callbacks, and both emitted a span. Every LCP, CLS, INP, FCP
and TTFB event was recorded twice.

Nothing threw, and p75 was unaffected because duplicating every sample preserves
percentiles, so the RUM board's vitals section stayed correct throughout. What
was wrong is every count over a vital: the rating breakdowns and
`Total Events by Type` on the RUM board read 2x for that period, and so does any
span count on this board over a window reaching back into it.

The duplicate registration is fixed, and
`tests/rum/smoke.test.js` guards it: the bundle runs a full page-view lifecycle
in headless Chromium and asserts exactly one `TTFB` span. Historical data is not
retroactively fixable. Use `COUNT_DISTINCT(session.id)` when counting across the
boundary.

## Configuration keys

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

Each environment has its own flag and config key, and both build both boards:

| Environment          | Flag               | Config key env var           | Board outputs                        |
| -------------------- | ------------------ | ---------------------------- | ------------------------------------ |
| `tollmanz-com`       | `manageProdBoard`  | `HONEYCOMB_CONFIG_KEY`       | `rumBoardIdProd`, `cwvBoardIdProd`   |
| `tollmanz-com-local` | `manageLocalBoard` | `HONEYCOMB_LOCAL_CONFIG_KEY` | `rumBoardIdLocal`, `cwvBoardIdLocal` |

Prerequisite: every column the board queries must already exist in the target
environment, because Honeycomb validates columns when a saved query is created
(`missing unknown column or derived column "<name>"`). Columns are created by
ingest, so the environment needs real RUM traffic first: run the site with
`RUM_MODE=local` and browse it (see `local/otel/README.md`). Prod has live
traffic and every column both boards use. The alternative, for a column ingest
cannot produce locally, is to declare it: see `LOCAL_STAGING_COLUMNS`.

`inp.value` is the one that bites. INP is only emitted after a qualifying user
interaction, and synthetic or headless clicks generally do not produce one, so a
local environment can have every other vital and still be missing INP. Seeding
the column with a single event is enough to unblock query creation:

```bash
curl -X POST https://api.honeycomb.io/1/events/tollmanz-com-web \
  -H "X-Honeycomb-Team: $HONEYCOMB_LOCAL_INGEST_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"name":"inp","inp.value":120}'
```

Column types are inferred per environment from the first value seen, so they can
differ between environments, and the type is not cosmetic. Honeycomb coerces
incoming values to the column's type and substitutes `0` when coercion is not
possible, so a numeric metric on the wrong type is corrupted at ingest rather
than merely displayed oddly.

`cls.value` is the one that matters. CLS is fractional, with the "good" and "poor"
thresholds at 0.1 and 0.25, so an `integer` column truncates every score toward
zero and makes `P75(cls.value)` meaningless. Prod had exactly that, and the column
was corrected to `float`; local was already `float`. Data written to prod before
the correction was coerced on the way in and is not recoverable by changing the
type, which only governs later writes.

`lcp.value`, `fcp.value`, and `inp.value` are still `integer` in prod. Those are
whole-millisecond timings in the hundreds or thousands, so truncation is
insignificant and they are left alone. Check the types before trusting a new
environment's board:

```bash
curl -sS -H "X-Honeycomb-Team: $KEY" \
  https://api.honeycomb.io/1/columns/tollmanz-com-web \
  | jq -r '.[] | select(.key_name|endswith(".value")) | "\(.key_name) \(.type)"'
```

Columns are still left to ingest rather than declared as Pulumi resources, since a
declared type would try to mutate whatever ingest already created. Fix a wrong
type in the UI schema view, or with `PUT /1/columns/<dataset>/<id>`.

To enable a board (prod shown; substitute the local flag and key for local):

1. In the Honeycomb UI, switch to the target environment, open its settings ->
   API Keys, and create a Configuration Key. Grant it "Manage Queries and
   Columns" and "Manage Boards". The "Run Queries" permission is not needed: the
   board tier only creates saved query specs, it never executes them, and that
   permission is plan-gated. Verify a key with
   `curl -H "X-Honeycomb-Team: $KEY" https://api.honeycomb.io/1/auth`, which
   should report `boards: true` and `columns: true` for the right environment.
   Copy the key.
2. Set the matching env var in the repo-root `.env` and add it as a GitHub
   Actions repository secret of the same name.
3. Turn the flag on for the stack. Committing the flag is what enables the board;
   CI applies it on push to `main`, so a local apply is optional:

   ```bash
   cd infra/honeycomb
   pulumi config set manageProdBoard true
   npm run up   # or let the honeycomb workflow apply it on merge
   ```

Honeycomb's own template had created a hand-made 9-panel board, also named `Real
User Monitoring (RUM)`, in both environments (`uymoPQWt5Hh` in `tollmanz-com`,
`nUnmjid2hYb` in `tollmanz-com-local`). Both were deleted once their panels were
reproduced in the overview section, so each environment has exactly one RUM
board and it is fully managed here. Recreating either by hand would produce two
boards with the same name, since Honeycomb keys boards by ID.

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
