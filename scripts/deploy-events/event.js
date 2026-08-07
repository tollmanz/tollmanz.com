// Canonical, vendor-neutral deployment event.
//
// Describes a deployment in terms any observability vendor can use: what was
// deployed, at which revision, by whom, and where to find the run. No
// vendor-specific fields live here; adapters (scripts/deploy-events/adapters/*)
// translate this shape to a vendor API. Bump SCHEMA_VERSION only for a breaking
// change to the shape, so adapters can evolve independently.

export const SCHEMA_VERSION = 1;

// Mirrors the two deploy pipelines: pages.yml (site) and infra.yml (infra).
const DEPLOYMENT_TYPES = new Set(["site", "infra"]);

const SERVICE = "tollmanz.com";
const ENVIRONMENT = "production";

// Short SHA for human-facing summaries; matches git's default abbreviation.
function shortSha(sha) {
  return sha ? sha.slice(0, 7) : "unknown";
}

function required(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`missing required environment variable ${name}`);
  }
  return value;
}

// RFC 3339 with second precision (no fractional seconds), e.g.
// 2026-07-15T18:04:05Z. Adapters that want other formats convert from here.
function toRfc3339(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Build the canonical event from the GitHub Actions environment plus the deploy
// type. `now` is injectable so tests get a deterministic timestamp.
export function buildEvent({ type, env = process.env, now = new Date() }) {
  if (!DEPLOYMENT_TYPES.has(type)) {
    throw new Error(
      `invalid deployment type "${type}"; expected one of ${[
        ...DEPLOYMENT_TYPES,
      ].join(", ")}`
    );
  }

  const sha = required(env, "GITHUB_SHA");
  const repository = required(env, "GITHUB_REPOSITORY");
  const runId = required(env, "GITHUB_RUN_ID");
  const serverUrl = env.GITHUB_SERVER_URL ?? "https://github.com";
  const actor = env.GITHUB_ACTOR ?? "unknown";
  const workflow = env.GITHUB_WORKFLOW ?? "unknown";

  return {
    schema_version: SCHEMA_VERSION,
    kind: "deployment",
    timestamp: toRfc3339(now),
    service: SERVICE,
    environment: ENVIRONMENT,
    deployment: {
      type,
      status: "succeeded",
      revision: sha,
      revision_url: `${serverUrl}/${repository}/commit/${sha}`,
      run_url: `${serverUrl}/${repository}/actions/runs/${runId}`,
      actor,
      workflow,
      summary: `${type} deploy ${shortSha(sha)} by ${actor}`,
    },
  };
}

// Structural check the harness runs before dispatch, so a malformed event fails
// fast rather than surfacing as an opaque vendor API error.
export function validateEvent(event) {
  if (event.schema_version !== SCHEMA_VERSION) {
    throw new Error(
      `unsupported schema_version ${event.schema_version}; expected ${SCHEMA_VERSION}`
    );
  }
  const d = event.deployment;
  if (!d || !DEPLOYMENT_TYPES.has(d.type)) {
    throw new Error("event.deployment.type must be site or infra");
  }
  for (const field of ["revision", "run_url", "summary"]) {
    if (!d[field]) {
      throw new Error(`event.deployment.${field} is required`);
    }
  }
  if (!event.timestamp) {
    throw new Error("event.timestamp is required");
  }
  return event;
}
