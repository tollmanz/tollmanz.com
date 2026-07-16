# Edge verification suite

`tests/edge/` is a black-box smoke test of the live edge. It asserts the
contract documented in [edge-caching.md](edge-caching.md) against a running host,
so it catches a regression in the Fastly config, the build, or GitHub Pages that
unit tests cannot see. It runs after every deploy and on a weekly schedule.

## What it checks

| File                         | Checks                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `cache-control.test.js`      | Cache-Control per asset class (HTML, feed, sitemap, fingerprinted CSS, fonts, favicon); a 404 is never immutable                       |
| `revalidation.test.js`       | HTML carries an ETag; a conditional request returns 304                                                                                |
| `compression.test.js`        | brotli, gzip, and identity negotiation; brotli preferred; Vary on Accept-Encoding; fonts not re-compressed; brotli shrinks the payload |
| `protocols.test.js`          | HTTP/2 negotiated; HTTP/3 advertised via alt-svc; a real HTTP/3 round trip when the runner's curl supports it                          |
| `tls.test.js`                | TLS 1.3 and TLS 1.2 accepted; session resumption; 0-RTT early data accepted                                                            |
| `redirects-security.test.js` | HTTP upgrades to HTTPS; apex redirects to www preserving the path; HSTS set with a long max-age                                        |

## Running it

```sh
pnpm run test:edge                                   # against production
EDGE_BASE_URL=https://staging.example.com pnpm run test:edge
```

The suite needs no package dependencies. It uses the Node test runner with `curl` and
`openssl`, all present on GitHub-hosted runners and macOS. `EDGE_BASE_URL`
defaults to `https://www.tollmanz.com`; override it to point at another host. The
apex-redirect tests run only when the base host is a `www` subdomain.

## Design notes

- requests go through `curl`, not Node's `fetch`. `fetch` transparently
  decompresses responses and rewrites the Content-Encoding and Content-Length
  headers, which would hide exactly what the compression tests assert. `curl`,
  without `--compressed`, reports the headers and on-the-wire byte count as the
  edge sent them
- TLS properties (protocol versions, resumption, 0-RTT) are not visible to an
  HTTP client, so those tests drive `openssl s_client`. It runs with stdin set to
  `/dev/null` so it completes the handshake, prints its summary, and exits;
  feeding it stdin through a pipe makes it block until the timeout instead
- fingerprinted CSS and font URLs carry a content hash that changes on every
  edit, so `lib/site.js` discovers them from the live HTML rather than hard-coding
  them
- the cache assertions retry a few times (`lib/retry.js`). Right after a deploy
  the edge can briefly serve a transient state while a new object propagates from
  the origin; the contract converges within seconds

## HTTP/3

The controllable contract is the `alt-svc` advertisement, which the
`http3: true` Fastly setting produces, and that assertion always runs. A real
HTTP/3 round trip needs a curl built with HTTP/3, which GitHub-hosted runners do
not ship, so that one test skips there rather than failing. To exercise a real h3
connection locally, run the suite with an HTTP/3-capable curl on `PATH` (for
example the `ymuski/curl-http3` Docker image); the test detects support and runs
automatically.

## In CI

`.github/workflows/edge-verify.yml` runs the suite:

- after `Deploy to GitHub Pages` or `Fastly infra (Pulumi)` completes
  successfully on `main`, via `workflow_run`. Infra pull-request previews are
  skipped, since they do not change the production edge
- on manual dispatch
- weekly, to catch edge config drift between deploys (a changed Fastly product
  entitlement, an expired cert, a reverted setting)

After a deploy it waits briefly for the purge and propagation to settle before
asserting. A failure fails the workflow, so a broken edge contract surfaces as a
red check on the run that caused it.

## Extending it

Add a new behavior as a `*.test.js` file under `tests/edge/`. Reuse the helpers
in `lib/`: `request` and `bodySize` for HTTP, `handshake` / `sessionResumption` /
`earlyData` for TLS, `discoverAssets` for fingerprinted URLs, and `retry` for any
assertion that should tolerate brief post-deploy propagation. Keep assertions
exact where the value is set by config (the Cache-Control strings come straight
from the VCL), so a test failure points at the specific drift.
