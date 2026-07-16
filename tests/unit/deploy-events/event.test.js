// Unit tests for the canonical deployment event builder.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEvent,
  validateEvent,
  SCHEMA_VERSION,
} from "../../../scripts/deploy-events/event.js";

const env = {
  GITHUB_SHA: "b7d0a72c1234567890abcdef",
  GITHUB_REPOSITORY: "tollmanz/tollmanz.com",
  GITHUB_RUN_ID: "123456",
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_ACTOR: "tollmanz",
  GITHUB_WORKFLOW: "Deploy to GitHub Pages",
};

const now = new Date("2026-07-15T18:04:05.123Z");

test("builds a canonical site event from the GitHub Actions env", () => {
  const event = buildEvent({ type: "site", env, now });

  assert.deepEqual(event, {
    schema_version: SCHEMA_VERSION,
    kind: "deployment",
    timestamp: "2026-07-15T18:04:05Z",
    service: "tollmanz.com",
    environment: "production",
    deployment: {
      type: "site",
      status: "succeeded",
      revision: "b7d0a72c1234567890abcdef",
      revision_url:
        "https://github.com/tollmanz/tollmanz.com/commit/b7d0a72c1234567890abcdef",
      run_url: "https://github.com/tollmanz/tollmanz.com/actions/runs/123456",
      actor: "tollmanz",
      workflow: "Deploy to GitHub Pages",
      summary: "site deploy b7d0a72 by tollmanz",
    },
  });
});

test("timestamp is RFC 3339 with no fractional seconds", () => {
  const event = buildEvent({ type: "infra", env, now });
  assert.match(event.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("infra type flows through to summary and deployment.type", () => {
  const event = buildEvent({ type: "infra", env, now });
  assert.equal(event.deployment.type, "infra");
  assert.equal(event.deployment.summary, "infra deploy b7d0a72 by tollmanz");
});

test("carries no Honeycomb-specific fields", () => {
  const event = buildEvent({ type: "site", env, now });
  assert.ok(!JSON.stringify(event).toLowerCase().includes("honeycomb"));
});

test("rejects an unknown deployment type", () => {
  assert.throws(
    () => buildEvent({ type: "database", env, now }),
    /invalid deployment type/
  );
});

test("requires GITHUB_SHA", () => {
  const missing = { ...env, GITHUB_SHA: undefined };
  assert.throws(
    () => buildEvent({ type: "site", env: missing, now }),
    /GITHUB_SHA/
  );
});

test("falls back to github.com when GITHUB_SERVER_URL is unset", () => {
  const missing = { ...env, GITHUB_SERVER_URL: undefined };
  const event = buildEvent({ type: "site", env: missing, now });
  assert.ok(event.deployment.run_url.startsWith("https://github.com/"));
});

test("validateEvent accepts a freshly built event", () => {
  const event = buildEvent({ type: "site", env, now });
  assert.equal(validateEvent(event), event);
});

test("validateEvent rejects an unsupported schema_version", () => {
  const event = buildEvent({ type: "site", env, now });
  event.schema_version = 99;
  assert.throws(() => validateEvent(event), /unsupported schema_version/);
});
