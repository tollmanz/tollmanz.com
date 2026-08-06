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

// Build a curated RUM board in one environment, authenticated with that
// environment's v1 Configuration Key. `slug` (prod/local) keeps resource names
// unique across the two boards. A compact hand-built board is preferred over
// importing the sprawling template board (see issue #59): the template's panels
// reference many UI-managed queries that `pulumi import` would leave unmanaged.
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

  const panels = vitals.map(v => {
    const query = new honeycombio.Query(
      `rum-${slug}-${v.key}`,
      {
        dataset: datasetName,
        queryJson: JSON.stringify({
          calculations: [{ op: "P75", column: `${v.key}.value` }],
          time_range: 604800,
        }),
      },
      providerOpts
    );
    const annotation = new honeycombio.QueryAnnotation(
      `rum-${slug}-${v.key}`,
      {
        dataset: datasetName,
        queryId: query.id,
        name: v.label,
        description: v.description,
      },
      providerOpts
    );
    return {
      type: "query",
      queryPanels: [
        {
          queryId: query.id,
          queryAnnotationId: annotation.id,
          queryStyle: "graph",
        },
      ],
    };
  });

  const board = new honeycombio.FlexibleBoard(
    `rum-${slug}-board`,
    {
      name: "Core Web Vitals (Pulumi-managed)",
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
    "Core Web Vitals for tollmanz.com browser RUM (p75 over the last 7 days). Managed by infra/honeycomb (Pulumi)."
  );
}

let localBoardId: pulumi.Output<string> | undefined;
if (manageLocalBoard) {
  localBoardId = rumBoard(
    "local",
    requireConfigKey("HONEYCOMB_LOCAL_CONFIG_KEY", "manageLocalBoard"),
    "Core Web Vitals for tollmanz.com browser RUM, local testing environment (p75 over the last 7 days). Managed by infra/honeycomb (Pulumi)."
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
