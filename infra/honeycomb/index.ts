import * as pulumi from "@pulumi/pulumi";
import * as honeycombio from "@pulumi/honeycombio";

// Provider authentication comes from the environment, never from committed
// config: a gitignored .env locally, GitHub Actions secrets in CI. The bridged
// Honeycomb provider reads the v2 Management Key pair from HONEYCOMB_KEY_ID and
// HONEYCOMB_KEY_SECRET. Fail fast if either is missing so the error is obvious.
for (const name of ["HONEYCOMB_KEY_ID", "HONEYCOMB_KEY_SECRET"]) {
  if (!process.env[name]) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in infra/honeycomb/.env locally or as a GitHub Actions secret in CI.`
    );
  }
}

const config = new pulumi.Config();
const environmentName = config.get("environmentName") ?? "tollmanz-com";
const localEnvironmentName =
  config.get("localEnvironmentName") ?? "tollmanz-com-local";

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
// local/otel/.env, where the local collector uses it to forward browser RUM
// here (see local/otel/README.md).
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

export const environmentId = environment.id;
export const environmentSlug = environment.slug;
export const localEnvironmentId = localEnvironment.id;
export const localEnvironmentSlug = localEnvironment.slug;

// Ingest keys, marked secret so they stay encrypted in state and masked in CLI
// and CI output. `ingestKey` is consumed by the Fastly stack through a
// StackReference; `localIngestKey` is read by hand for local/otel/.env.
export const ingestKey = pulumi.secret(ingest.key);
export const localIngestKey = pulumi.secret(localIngest.key);
