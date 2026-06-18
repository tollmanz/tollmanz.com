// HTTP helpers built on curl rather than Node's fetch.
//
// Native fetch (undici) transparently decompresses responses and rewrites the
// Content-Encoding and Content-Length headers, which would hide the exact thing
// the compression tests assert. curl, invoked without --compressed, reports the
// response headers and on-the-wire byte count exactly as the edge sent them.

import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const TIMEOUT_MS = 25000;
const MAX_BUFFER = 16 * 1024 * 1024;

// Parse a raw curl header dump (status line plus headers) into a structured
// response. A dump can contain more than one HTTP message (a 1xx informational
// prelude such as 103 Early Hints, then the final response); the last status
// line and the headers that follow it win.
function parseHead(raw) {
  let status = 0;
  let httpVersion = "";
  let headers = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.replace(/\r$/, "");
    const statusMatch = trimmed.match(/^HTTP\/(\S+)\s+(\d{3})/);
    if (statusMatch) {
      httpVersion = statusMatch[1];
      status = Number(statusMatch[2]);
      headers = {};
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon > 0) {
      const name = trimmed.slice(0, colon).trim().toLowerCase();
      const value = trimmed.slice(colon + 1).trim();
      headers[name] = name in headers ? `${headers[name]}, ${value}` : value;
    }
  }
  return { status, httpVersion, headers };
}

function buildArgs(target, opts) {
  const { acceptEncoding, ifNoneMatch, http, headers = {} } = opts;
  // -sS: quiet but show errors. -o /dev/null: discard the body. -D -: dump
  // response headers to stdout. No -L, so redirects are observed, not followed.
  const args = ["-sS", "-o", "/dev/null", "-D", "-", "--max-time", "25"];
  // curl sends no Accept-Encoding unless asked, so the origin returns identity
  // by default. A caller opts into compression by passing acceptEncoding.
  if (acceptEncoding) args.push("-H", `Accept-Encoding: ${acceptEncoding}`);
  if (ifNoneMatch) args.push("-H", `If-None-Match: ${ifNoneMatch}`);
  for (const [name, value] of Object.entries(headers)) {
    args.push("-H", `${name}: ${value}`);
  }
  if (http === 2) args.push("--http2");
  if (http === "1.1") args.push("--http1.1");
  args.push(target);
  return args;
}

// Issue a GET and return { status, httpVersion, headers }. The body is
// discarded; only the response metadata is inspected.
export async function request(target, opts = {}) {
  const { stdout } = await run("curl", buildArgs(target, opts), {
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
  return parseHead(stdout);
}

// Return the number of bytes transferred for the body of a GET. Without
// --compressed this is the on-the-wire size, so it reflects the compressed
// payload when acceptEncoding asks the edge to compress.
export async function bodySize(target, { acceptEncoding } = {}) {
  const args = [
    "-sS",
    "-o",
    "/dev/null",
    "-w",
    "%{size_download}",
    "--max-time",
    "25",
  ];
  if (acceptEncoding) args.push("-H", `Accept-Encoding: ${acceptEncoding}`);
  args.push(target);
  const { stdout } = await run("curl", args, {
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
  return Number.parseInt(stdout.trim(), 10);
}

// Fetch a text body (decompressed). Used to discover fingerprinted asset URLs
// from the rendered HTML.
export async function fetchText(target) {
  const { stdout } = await run(
    "curl",
    ["-sS", "--compressed", "--max-time", "25", target],
    { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }
  );
  return stdout;
}

// Whether the runner's curl was built with HTTP/3 support. GitHub-hosted
// runners ship a curl without it, so the real-h3 round trip skips there and the
// alt-svc advertisement carries the HTTP/3 assertion instead.
export function curlSupportsHttp3() {
  try {
    const version = execFileSync("curl", ["--version"], { encoding: "utf8" });
    return /\bHTTP3\b/i.test(version);
  } catch {
    return false;
  }
}

// Attempt an HTTP/3-only round trip. Returns the negotiated http version string
// (e.g. "3") on success. Throws if curl lacks HTTP/3 or the connection fails.
export async function http3Request(target) {
  const { stdout } = await run(
    "curl",
    [
      "-sS",
      "--http3-only",
      "-o",
      "/dev/null",
      "-w",
      "%{http_version} %{http_code}",
      "--max-time",
      "25",
      target,
    ],
    { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }
  );
  const [httpVersion, status] = stdout.trim().split(/\s+/);
  return { httpVersion, status: Number(status) };
}
