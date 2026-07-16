// Unit tests for the Honeycomb marker adapter.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  name,
  toMarker,
  request,
  send,
} from "../../../scripts/deploy-events/adapters/honeycomb.js";

const event = {
  schema_version: 1,
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
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("adapter is named honeycomb", () => {
  assert.equal(name, "honeycomb");
});

test("maps the canonical event to a Honeycomb marker", () => {
  assert.deepEqual(toMarker(event), {
    message: "site deploy b7d0a72 by tollmanz",
    type: "deploy-site",
    start_time: 1784138645,
    url: "https://github.com/tollmanz/tollmanz.com/actions/runs/123456",
  });
});

test("start_time is the timestamp in Unix seconds", () => {
  const marker = toMarker(event);
  assert.equal(
    marker.start_time,
    Math.floor(Date.parse(event.timestamp) / 1000)
  );
});

test("defaults the dataset to tollmanz-com-web", () => {
  const req = request(event, {});
  assert.equal(req.url, "https://api.honeycomb.io/1/markers/tollmanz-com-web");
});

test("uses HONEYCOMB_DATASET when set", () => {
  const req = request(event, { HONEYCOMB_DATASET: "tollmanz-com" });
  assert.equal(req.url, "https://api.honeycomb.io/1/markers/tollmanz-com");
});

test("send posts the marker with the auth header on success", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 201, statusText: "Created" };
  };

  await send(event, { HONEYCOMB_API_KEY: "secret", HONEYCOMB_DATASET: "ds" });

  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, "https://api.honeycomb.io/1/markers/ds");
  assert.equal(options.method, "POST");
  assert.equal(options.headers["X-Honeycomb-Team"], "secret");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(options.body), toMarker(event));
});

test("send throws with detail on a non-2xx response", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    text: async () => "bad key",
  });

  await assert.rejects(
    send(event, { HONEYCOMB_API_KEY: "secret" }),
    /honeycomb marker failed: 401 Unauthorized - bad key/
  );
});

test("send throws when the API key is missing", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return { ok: true };
  };

  await assert.rejects(send(event, {}), /HONEYCOMB_API_KEY/);
  assert.equal(called, false, "must not call fetch without a key");
});
