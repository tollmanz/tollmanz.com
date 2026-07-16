// Honeycomb marker adapter.
//
// Maps the canonical deployment event to a Honeycomb marker:
// POST https://api.honeycomb.io/1/markers/{dataset}. Markers annotate charts at
// a point in time. This is the ONLY file that knows about Honeycomb; the
// canonical event stays vendor-neutral (see scripts/deploy-events/event.js).
//
// Auth uses X-Honeycomb-Team with a Configuration Key that has the Manage
// Markers permission. Dataset comes from HONEYCOMB_DATASET, defaulting to
// tollmanz-com-web (the dataset receiving the site's RUM and Fastly telemetry).

const API_BASE = "https://api.honeycomb.io/1/markers";
const DEFAULT_DATASET = "tollmanz-com-web";

export const name = "honeycomb";

// Translate the canonical event into the Honeycomb marker body. Honeycomb wants
// start_time as Unix seconds; the canonical timestamp is RFC 3339.
export function toMarker(event) {
  const { deployment, timestamp } = event;
  return {
    message: deployment.summary,
    // `deploy-site` / `deploy-infra`: groups markers and drives chart color.
    type: `deploy-${deployment.type}`,
    start_time: Math.floor(Date.parse(timestamp) / 1000),
    url: deployment.run_url,
  };
}

// Full request the adapter would send. Exposed so --dry-run and tests can
// inspect the mapping without hitting the network.
export function request(event, env = process.env) {
  const dataset = env.HONEYCOMB_DATASET || DEFAULT_DATASET;
  return {
    method: "POST",
    url: `${API_BASE}/${encodeURIComponent(dataset)}`,
    body: toMarker(event),
  };
}

export async function send(event, env = process.env) {
  const apiKey = env.HONEYCOMB_CONFIG_KEY;
  if (!apiKey) {
    throw new Error(
      "missing required environment variable HONEYCOMB_CONFIG_KEY"
    );
  }

  const { url, method, body } = request(event, env);
  const res = await fetch(url, {
    method,
    headers: {
      "X-Honeycomb-Team": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `honeycomb marker failed: ${res.status} ${res.statusText}${
        detail ? ` - ${detail}` : ""
      }`
    );
  }
}
