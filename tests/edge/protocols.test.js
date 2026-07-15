// HTTP protocol support.
//
// The Fastly service enables HTTP/2 and HTTP/3 (http3: true in infra/index.ts).
// The h3 advertisement via alt-svc is the controllable contract and is always
// asserted; a real HTTP/3 round trip is attempted only when the runner's curl
// was built with HTTP/3 (GitHub-hosted runners ship one without it).

import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "./config.js";
import { request, curlSupportsHttp3, http3Request } from "./lib/curl.js";

test("HTTP/2 is negotiated", async () => {
  const res = await request(`${config.baseUrl}/`, { http: 2 });
  assert.equal(res.status, 200);
  assert.equal(res.httpVersion, "2");
});

test("HTTP/3 is advertised via alt-svc", async () => {
  const res = await request(`${config.baseUrl}/`);
  const altSvc = res.headers["alt-svc"] || "";
  assert.ok(
    /h3(-\d+)?=/.test(altSvc),
    `expected alt-svc to advertise h3, got: ${altSvc}`
  );
});

test(
  "an HTTP/3 round trip succeeds",
  { skip: curlSupportsHttp3() ? false : "curl built without HTTP/3 support" },
  async () => {
    const res = await http3Request(`${config.baseUrl}/`);
    assert.equal(res.status, 200);
    assert.equal(res.httpVersion, "3");
  }
);
