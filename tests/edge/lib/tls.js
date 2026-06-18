// TLS helpers built on the openssl s_client CLI.
//
// These probe properties an HTTP client cannot observe: which protocol versions
// the edge accepts, whether it resumes a prior session, and whether it accepts
// TLS 1.3 0-RTT early data. openssl is present on GitHub-hosted runners and
// macOS, and version 3.x supports -early_data.
//
// s_client is run with stdin set to /dev/null (stdio "ignore"). With an empty
// stdin it sees EOF immediately, completes the handshake, prints its session
// summary, and exits. Feeding it stdin through a pipe instead (the child_process
// input option) makes it block on the socket until the timeout, so it is
// avoided here.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TIMEOUT_MS = 20000;

// s_client exits non-zero in ordinary flows (the peer closing the connection,
// for one), so output is captured regardless of exit status and the caller
// decides success from the handshake summary it parses.
function openssl(args) {
  return new Promise(resolve => {
    const child = spawn("openssl", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const collect = chunk => {
      out += chunk;
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve(out);
    };
    child.on("close", done);
    child.on("error", done);
  });
}

function connect(host, ...extra) {
  return ["s_client", "-connect", `${host}:443`, "-servername", host, ...extra];
}

// Open a single connection and report the negotiated protocol and cipher.
// version is an openssl flag such as "-tls1_3" or "-tls1_2"; omit it to let the
// edge pick.
export async function handshake(host, version) {
  const out = await openssl(connect(host, ...(version ? [version] : [])));
  const protocol = (out.match(/Protocol\s*:\s*(\S+)/) || [])[1] || "";
  return {
    out,
    protocol,
    cipher: (out.match(/Cipher\s*:\s*(\S+)/) || [])[1] || "",
    connected: protocol !== "" && /Verify return code: 0/.test(out),
  };
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "edge-tls-"));
  return Promise.resolve(fn(dir)).finally(() =>
    rmSync(dir, { recursive: true, force: true })
  );
}

// Capture a TLS 1.3 session ticket, then reconnect with it and report whether
// the edge resumed the session.
export async function sessionResumption(host) {
  return withTempDir(async dir => {
    const sess = join(dir, "sess.pem");
    await openssl(connect(host, "-tls1_3", "-sess_out", sess));
    const out = await openssl(connect(host, "-sess_in", sess));
    return { reused: /Reused, TLSv1\.\d/.test(out), out };
  });
}

// Capture a fresh TLS 1.3 session ticket (separate from the resumption probe,
// since tickets can be single-use), then resume it sending an HTTP request as
// 0-RTT early data and report whether the edge accepted it.
export async function earlyData(host) {
  return withTempDir(async dir => {
    const sess = join(dir, "sess.pem");
    const reqFile = join(dir, "req.txt");
    writeFileSync(
      reqFile,
      `GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`
    );
    await openssl(connect(host, "-tls1_3", "-sess_out", sess));
    const out = await openssl(
      connect(host, "-sess_in", sess, "-early_data", reqFile)
    );
    const maxMatch = out.match(/Max Early Data:\s*(\d+)/);
    return {
      accepted: /Early data was accepted/.test(out),
      maxEarlyData: maxMatch ? Number(maxMatch[1]) : 0,
      out,
    };
  });
}
