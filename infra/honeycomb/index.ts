import * as pulumi from "@pulumi/pulumi";
import * as honeycombio from "@pulumi/honeycombio";

// Provider authentication comes from the environment, never from committed
// config: the gitignored repo-root .env locally, GitHub Actions secrets in CI.
// The bridged Honeycomb provider reads the v2 Management Key pair from
// HONEYCOMB_KEY_ID and HONEYCOMB_KEY_SECRET. Fail fast if either is missing so
// the error is obvious.
for (const name of ["HONEYCOMB_KEY_ID", "HONEYCOMB_KEY_SECRET"]) {
  if (!process.env[name]) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in the repo-root .env locally or as a GitHub Actions secret in CI.`
    );
  }
}

const config = new pulumi.Config();
const environmentName = config.get("environmentName") ?? "tollmanz-com";
const localEnvironmentName =
  config.get("localEnvironmentName") ?? "tollmanz-com-local";

// Whether to manage the RUM boards (see the v1 board tier below). Gated on
// committed flags, not on env-var presence, so board state is deterministic
// across every apply context. The dataset is created on ingest and named by the
// browser SDK's serviceName (see assets/rum/index.js, scripts/build-rum.mjs); it
// carries the same name in both environments, scoped per environment by the
// config key each board provider authenticates with.
const manageProdBoard = config.getBoolean("manageProdBoard") ?? false;
const manageLocalBoard = config.getBoolean("manageLocalBoard") ?? false;
const datasetName = config.get("datasetName") ?? "tollmanz-com-web";

// Production Honeycomb environment that holds browser RUM telemetry. In the
// Environments and Services model datasets are created on ingest, so none is
// declared here; the ingest key below creates it on the first telemetry it
// receives.
const environment = new honeycombio.Environment("rum", {
  name: environmentName,
  description: "tollmanz.com browser RUM (OpenTelemetry)",
  color: "blue",
});

// Ingest key the Fastly edge proxy injects as the x-honeycomb-team header. It is
// write-only and never reaches the browser. createDatasets lets the first
// telemetry create the dataset named by the browser SDK's serviceName.
const ingest = new honeycombio.ApiKey("rum-ingest", {
  name: "tollmanz-com RUM ingest",
  type: "ingest",
  environmentId: environment.id,
  permissions: [{ createDatasets: true }],
});

// A separate environment for local RUM testing, isolated from prod so local
// runs never taint production data. Its ingest key is exported below; read it
// with `pulumi stack output localIngestKey --show-secrets` and paste it into
// HONEYCOMB_LOCAL_INGEST_KEY in the repo-root .env, where the local collector
// uses it to forward browser RUM here (see local/otel/README.md).
const localEnvironment = new honeycombio.Environment("rum-local", {
  name: localEnvironmentName,
  description: "tollmanz.com browser RUM, local testing only",
  color: "green",
});

const localIngest = new honeycombio.ApiKey("rum-local-ingest", {
  name: "tollmanz-com RUM ingest (local)",
  type: "ingest",
  environmentId: localEnvironment.id,
  permissions: [{ createDatasets: true }],
});

// v1 board tier (see issue #59).
//
// Boards, queries, and query annotations are Honeycomb v1 API resources. They
// need a v1 Configuration Key scoped to a single environment, not the v2
// Management Key the provider above authenticates with. Minting a configuration
// key from the Management Key fails on this plan ("access to this API is
// disabled: Error Creating Honeycomb API Key"), so each key is created by hand
// in the Honeycomb UI (Environment settings -> API Keys) and supplied out of
// band via an env var rather than by a honeycombio.ApiKey resource.
//
// Enablement is gated on committed flags, not on env-var presence, so state is
// deterministic across apply contexts: with one shared stack, keying on env-var
// presence would let a local apply create a board and a CI apply without the key
// delete it. Flip a flag only once its config key exists both in the repo-root
// .env and as the matching GitHub Actions secret. See infra/honeycomb/README.md.

// Core Web Vitals tracked on every board. WebVitalsInstrumentation emits each
// metric as its own span carrying a `<metric>.value` field; p75 is the value
// Google reports for Core Web Vitals.
const vitals = [
  {
    key: "lcp",
    label: "LCP p75",
    description: "Largest Contentful Paint, 75th percentile (ms)",
  },
  {
    key: "inp",
    label: "INP p75",
    description: "Interaction to Next Paint, 75th percentile (ms)",
  },
  {
    key: "cls",
    label: "CLS p75",
    description: "Cumulative Layout Shift, 75th percentile",
  },
  {
    key: "fcp",
    label: "FCP p75",
    description: "First Contentful Paint, 75th percentile (ms)",
  },
  {
    key: "ttfb",
    label: "TTFB p75",
    description: "Time to First Byte, 75th percentile (ms)",
  },
];

// The RUM overview section, ported from the hand-made `Real User Monitoring
// (RUM)` board that Honeycomb's template created in both environments. Each
// entry reproduces that board's saved query as a managed resource rather than
// pointing at the UI-owned query by ID, so the whole board is code and nothing
// breaks if the hand-made board is retired.
//
// These queries are environment-wide in the template (`__all__`); here they are
// scoped to the one dataset the environment has, matching the vitals section.
// Every column they reference exists in both environments. `position` preserves
// the template's own arrangement, offset below the vitals section.
//
// They all use a 7200s (two hour) window at 10s granularity, as the template
// did. That is deliberately shorter than the vitals section's 7 day p75, so the
// two sections answer different questions: what is happening now, and what the
// steady-state user experience looks like.
const overview = [
  {
    key: "lcp-ratings",
    label: "Largest Contentful Paint (LCP)",
    description:
      "Ratings based on the render time for the largest content on a page",
    style: "combo",
    position: { x: 0, y: 0, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["lcp.rating", "name"],
      calculations: [{ op: "COUNT" }],
      filters: [{ column: "name", op: "in", value: ["LCP", "lcp"] }],
      orders: [{ op: "COUNT", order: "descending" }],
      time_range: 7200,
    },
  },
  {
    key: "cls-ratings",
    label: "Cumulative Layout Shift (CLS)",
    description: "Ratings based on the stability of content layout on a page",
    style: "combo",
    position: { x: 4, y: 0, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["cls.rating", "name"],
      calculations: [{ op: "COUNT" }],
      filters: [{ column: "name", op: "in", value: ["CLS", "cls"] }],
      orders: [{ op: "COUNT", order: "descending" }],
      time_range: 7200,
    },
  },
  {
    key: "lcp-p75",
    label: "Largest Contentful Paint P75",
    description: "The 75th percentile for LCP",
    style: "graph",
    position: { x: 8, y: 0, width: 4, height: 4 },
    query: {
      granularity: 10,
      calculations: [{ column: "lcp.value", op: "P75" }],
      filters: [{ column: "name", op: "in", value: ["LCP", "lcp"] }],
      orders: [{ column: "lcp.value", op: "P75", order: "descending" }],
      time_range: 7200,
    },
  },
  {
    key: "cls-p75",
    label: "Cumulative Layout Shift P75",
    description: "The 75th percentile for CLS",
    style: "graph",
    position: { x: 0, y: 8, width: 4, height: 4 },
    query: {
      granularity: 10,
      calculations: [{ column: "cls.value", op: "P75" }],
      filters: [{ column: "name", op: "in", value: ["CLS", "cls"] }],
      orders: [{ column: "cls.value", op: "P75", order: "descending" }],
      time_range: 7200,
    },
  },
  {
    key: "events-by-type",
    label: "Total Events by Type",
    description: "Event types ranked by occurrence",
    style: "combo",
    position: { x: 4, y: 8, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["name"],
      calculations: [{ op: "COUNT" }],
      filters: [
        { column: "meta.annotation_type", op: "!=", value: "span_event" },
      ],
      orders: [{ op: "COUNT", order: "descending" }],
      limit: 100,
      time_range: 7200,
    },
  },
  {
    key: "largest-resources",
    label: "Largest Resource Requests",
    description:
      "The largest resource requests ranked by the average length of their response content",
    style: "table",
    position: { x: 8, y: 8, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["http.url"],
      calculations: [{ column: "http.response_content_length", op: "AVG" }],
      filters: [
        { column: "http.response_content_length", op: "exists" },
        { column: "name", op: "=", value: "resourceFetch" },
      ],
      orders: [
        {
          column: "http.response_content_length",
          op: "AVG",
          order: "descending",
        },
      ],
      limit: 100,
      time_range: 7200,
    },
  },
  {
    key: "slowest-endpoints",
    label: "Slowest Requests by Endpoint",
    description:
      "The slowest endpoints based on the 75th percentile of request durations",
    style: "table",
    position: { x: 0, y: 16, width: 4, height: 8 },
    query: {
      breakdowns: ["name", "http.url"],
      calculations: [{ column: "duration_ms", op: "P75" }],
      filters: [
        { column: "http.url", op: "exists" },
        {
          column: "name",
          op: "in",
          value: ["HTTP GET", "HTTP POST", "GET", "POST"],
        },
      ],
      orders: [{ column: "duration_ms", op: "P75", order: "descending" }],
      limit: 100,
      time_range: 7200,
    },
  },
  {
    key: "top-landing-pages",
    label: "Top Landing Pages by Session Count",
    description: "The most visited landing pages ranked by session count",
    style: "table",
    position: { x: 4, y: 16, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["entry_page.path"],
      calculations: [{ op: "COUNT" }],
      filters: [
        { column: "entry_page.path", op: "exists" },
        { column: "name", op: "=", value: "documentLoad" },
      ],
      orders: [{ op: "COUNT", order: "descending" }],
      limit: 100,
      time_range: 7200,
    },
  },
  {
    key: "busiest-pages",
    label: "Pages With the Most Events",
    description:
      "Pages with the highest number of events, highlighting the most active pages",
    style: "table",
    position: { x: 8, y: 16, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["page.route"],
      calculations: [{ op: "COUNT" }],
      filters: [{ column: "page.route", op: "exists" }],
      orders: [{ op: "COUNT", order: "descending" }],
      limit: 100,
      time_range: 7200,
    },
  },
];

// Honeycomb lays boards out on a 12 column grid. The vitals sit three to a row
// under their heading, then the ported overview section starts below them, so
// each section reads as its own block.
const GRID_COLUMNS = 12;
const HEADING_HEIGHT = 2;
const VITAL_WIDTH = 4;
const VITAL_HEIGHT = 4;
const VITALS_PER_ROW = GRID_COLUMNS / VITAL_WIDTH;
const VITALS_ORIGIN_Y = HEADING_HEIGHT;
const OVERVIEW_HEADING_Y =
  VITALS_ORIGIN_Y + Math.ceil(vitals.length / VITALS_PER_ROW) * VITAL_HEIGHT;
const OVERVIEW_ORIGIN_Y = OVERVIEW_HEADING_Y + HEADING_HEIGHT;

// Build a curated RUM board in one environment, authenticated with that
// environment's v1 Configuration Key. `slug` (prod/local) keeps resource names
// unique across the two boards.
//
// The name deliberately differs from the hand-made `Real User Monitoring (RUM)`
// template board that already exists in both environments, so the two coexist
// unambiguously in the boards list. Honeycomb keys boards by ID and permits
// duplicate names, so reusing that name would silently produce two similar-
// looking boards in the same environment.
function rumBoard(
  slug: string,
  configKey: string,
  description: string
): pulumi.Output<string> {
  const provider = new honeycombio.Provider(`rum-${slug}-config`, {
    apiKey: configKey,
  });
  const providerOpts = { provider };

  // A query panel and the two resources behind it. `name` is the Pulumi resource
  // name and must stay stable: the vitals panels were created as
  // `rum-<slug>-<key>` before the overview section existed, and changing those
  // names would replace live queries.
  const queryPanel = (
    name: string,
    queryJson: object,
    label: string,
    caption: string,
    style: string,
    position: { x: number; y: number; width: number; height: number }
  ) => {
    const query = new honeycombio.Query(
      name,
      { dataset: datasetName, queryJson: JSON.stringify(queryJson) },
      providerOpts
    );
    const annotation = new honeycombio.QueryAnnotation(
      name,
      {
        dataset: datasetName,
        queryId: query.id,
        name: label,
        description: caption,
      },
      providerOpts
    );
    return {
      type: "query",
      position: {
        xCoordinate: position.x,
        yCoordinate: position.y,
        width: position.width,
        height: position.height,
      },
      queryPanels: [
        {
          queryId: query.id,
          queryAnnotationId: annotation.id,
          queryStyle: style,
        },
      ],
    };
  };

  // Full-width Markdown panel that titles a section.
  const heading = (yCoordinate: number, content: string) => ({
    type: "text",
    position: {
      xCoordinate: 0,
      yCoordinate,
      width: GRID_COLUMNS,
      height: HEADING_HEIGHT,
    },
    textPanels: [{ content }],
  });

  const panels = [
    heading(
      0,
      "## Core Web Vitals\n\np75 over the last 7 days, the window Google reports Core Web Vitals over."
    ),
    ...vitals.map((v, i) =>
      queryPanel(
        `rum-${slug}-${v.key}`,
        {
          calculations: [{ op: "P75", column: `${v.key}.value` }],
          time_range: 604800,
        },
        v.label,
        v.description,
        "graph",
        {
          x: (i % VITALS_PER_ROW) * VITAL_WIDTH,
          y: VITALS_ORIGIN_Y + Math.floor(i / VITALS_PER_ROW) * VITAL_HEIGHT,
          width: VITAL_WIDTH,
          height: VITAL_HEIGHT,
        }
      )
    ),
    heading(
      OVERVIEW_HEADING_Y,
      "## RUM overview\n\nPorted from the hand-made `Real User Monitoring (RUM)` board, over a two hour window."
    ),
    ...overview.map(o =>
      queryPanel(
        `rum-${slug}-ov-${o.key}`,
        o.query,
        o.label,
        o.description,
        o.style,
        { ...o.position, y: OVERVIEW_ORIGIN_Y + o.position.y }
      )
    ),
  ];

  const board = new honeycombio.FlexibleBoard(
    `rum-${slug}-board`,
    {
      name: "Real User Monitoring (Pulumi-managed)",
      description,
      panels,
    },
    providerOpts
  );

  return board.id;
}

// Read a required config key, failing fast with an actionable message so a
// misconfigured apply errors loudly instead of deleting a board.
function requireConfigKey(envVar: string, flag: string): string {
  const key = process.env[envVar];
  if (!key) {
    throw new Error(
      `${flag} is true but ${envVar} is not set. Create a v1 Configuration Key for the target environment in the Honeycomb UI, then set it in the repo-root .env locally or as a GitHub Actions secret in CI. See infra/honeycomb/README.md.`
    );
  }
  return key;
}

let prodBoardId: pulumi.Output<string> | undefined;
if (manageProdBoard) {
  prodBoardId = rumBoard(
    "prod",
    requireConfigKey("HONEYCOMB_CONFIG_KEY", "manageProdBoard"),
    "Core Web Vitals and a RUM overview for tollmanz.com browser RUM. Managed by infra/honeycomb (Pulumi)."
  );
}

let localBoardId: pulumi.Output<string> | undefined;
if (manageLocalBoard) {
  localBoardId = rumBoard(
    "local",
    requireConfigKey("HONEYCOMB_LOCAL_CONFIG_KEY", "manageLocalBoard"),
    "Core Web Vitals and a RUM overview for tollmanz.com browser RUM, local testing environment. Managed by infra/honeycomb (Pulumi)."
  );
}

export const environmentId = environment.id;
export const environmentSlug = environment.slug;
export const localEnvironmentId = localEnvironment.id;
export const localEnvironmentSlug = localEnvironment.slug;

// Ingest keys, marked secret so they stay encrypted in state and masked in CLI
// and CI output. `ingestKey` is consumed by the Fastly stack through a
// StackReference; `localIngestKey` is read by hand for the repo-root .env.
export const ingestKey = pulumi.secret(ingest.key);
export const localIngestKey = pulumi.secret(localIngest.key);

// IDs of the curated RUM boards, when managed. Each is undefined until its flag
// is enabled with the matching v1 Configuration Key present.
export const rumBoardIdProd = prodBoardId;
export const rumBoardIdLocal = localBoardId;
