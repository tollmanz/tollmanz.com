import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { opensslCapabilities } from "../edge/lib/tls.js";

function fakeOpenSsl(version, help) {
  const dir = mkdtempSync(join(tmpdir(), "fake-openssl-"));
  const bin = join(dir, "openssl");
  writeFileSync(
    bin,
    `#!/bin/sh
if [ "$1" = "version" ]; then
  printf '%s\\n' '${version}'
else
  printf '%s\\n' '${help}' >&2
fi
`
  );
  chmodSync(bin, 0o755);
  return { bin, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("opensslCapabilities honors OPENSSL_BIN and detects supported probes", async () => {
  const fake = fakeOpenSsl(
    "OpenSSL 3.5.2 5 Aug 2025",
    "-tls1_3 -sess_in -sess_out -early_data"
  );

  try {
    const capabilities = await opensslCapabilities({ OPENSSL_BIN: fake.bin });
    assert.deepEqual(capabilities, {
      bin: fake.bin,
      version: "OpenSSL 3.5.2 5 Aug 2025",
      sessionResumption: true,
      earlyData: true,
    });
  } finally {
    fake.cleanup();
  }
});

test("opensslCapabilities rejects LibreSSL for TLS 1.3 ticket probes", async () => {
  const fake = fakeOpenSsl(
    "LibreSSL 3.3.6",
    "-tls1_3 -sess_in -sess_out -ign_eof"
  );

  try {
    const capabilities = await opensslCapabilities({ OPENSSL_BIN: fake.bin });
    assert.equal(capabilities.sessionResumption, false);
    assert.equal(capabilities.earlyData, false);
  } finally {
    fake.cleanup();
  }
});

test("opensslCapabilities disables only early data when its flag is missing", async () => {
  const fake = fakeOpenSsl(
    "OpenSSL 1.1.1w  11 Sep 2023",
    "-tls1_3 -sess_in -sess_out"
  );

  try {
    const capabilities = await opensslCapabilities({ OPENSSL_BIN: fake.bin });
    assert.equal(capabilities.sessionResumption, true);
    assert.equal(capabilities.earlyData, false);
  } finally {
    fake.cleanup();
  }
});
