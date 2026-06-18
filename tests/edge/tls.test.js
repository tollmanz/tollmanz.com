// TLS configuration: protocol versions, session resumption, and 0-RTT.
//
// Resumption lets a returning client skip the full handshake; 0-RTT (TLS 1.3
// early data) lets it send the first request inside the resumed handshake,
// saving a round trip. Both are edge properties an HTTP client cannot see, so
// these tests drive openssl s_client directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "./config.js";
import { handshake, sessionResumption, earlyData } from "./lib/tls.js";

test("TLS 1.3 is supported", async () => {
  const res = await handshake(config.host, "-tls1_3");
  assert.ok(res.connected, `TLS 1.3 handshake failed:\n${res.out.slice(-400)}`);
  assert.equal(res.protocol, "TLSv1.3");
});

test("TLS 1.2 is supported for broad client compatibility", async () => {
  const res = await handshake(config.host, "-tls1_2");
  assert.ok(res.connected, `TLS 1.2 handshake failed:\n${res.out.slice(-400)}`);
  assert.equal(res.protocol, "TLSv1.2");
});

test("the edge resumes a prior TLS session", async () => {
  const res = await sessionResumption(config.host);
  assert.ok(
    res.reused,
    `expected the session to be reused:\n${res.out.slice(-400)}`
  );
});

test("the edge accepts TLS 1.3 0-RTT early data", async () => {
  const res = await earlyData(config.host);
  assert.ok(
    res.maxEarlyData > 0,
    `expected a non-zero Max Early Data, got ${res.maxEarlyData}`
  );
  assert.ok(
    res.accepted,
    `expected early data to be accepted:\n${res.out.slice(-400)}`
  );
});
