# Edge caching, compression, and transport

How tollmanz.com caches, compresses, and serves content at the edge, and why.
The behavior described here is enforced by the test suite in `tests/edge/`
(documented in [edge-verification.md](edge-verification.md)) and was shipped in
PRs #49, #50, and #51.

## The problem

The site is static, built by Eleventy and published to GitHub Pages. GitHub
Pages labels every response `Cache-Control: max-age=600`. That single blanket
value is wrong in two opposite directions at once:

- ten minutes is too long for a stable-URL asset: edit `main.css` and a returning
  visitor can keep the old stylesheet for up to ten minutes, so a rollout is not
  instant
- ten minutes is too short for an asset whose URL already changes on every edit:
  a content-hashed file could be cached forever, but GitHub Pages still expires
  it in ten minutes

GitHub Pages exposes no per-path cache configuration, so the fix lives at the
CDN.

## The architecture

A request passes through two independent Fastly layers before it reaches the
HTML:

```
client -> Fastly (this project's service) -> GitHub Pages (itself Fastly) -> origin storage
```

This project controls only the first Fastly service, configured as code with
Pulumi in `infra/`. It fronts GitHub Pages as the CDN and TLS terminator. The
backend connects to `tollmanz.github.io` (whose TLS cert covers `*.github.io`)
but sends `Host: www.tollmanz.com` via `overrideHost`, which selects this repo's
site and avoids a redirect. The `iad-va-us` shield POP concentrates origin
fetches so most edge POPs fill from the shield rather than from GitHub Pages.

Two mechanisms produce the caching behavior:

- content fingerprinting at build time, so assets that change get a new URL
- a Fastly fetch snippet that rewrites the cache headers per asset class, so each
  class gets the policy it should have rather than the blanket `max-age=600`

## Cache-Control by asset class

`infra/snippets/cache-control-fetch.vcl` runs in `vcl_fetch` and rewrites both
Fastly's own object lifetime (`beresp.ttl`) and the browser-facing
`Cache-Control`. The edge holds every class for a year and is kept fresh by a
purge on each deploy, so a long edge TTL never serves stale content. The browser
gets a different policy per class.

| Class                       | Matches                                                           | Browser Cache-Control                 | Edge TTL                          |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------- | --------------------------------- |
| Fingerprinted CSS/JS, fonts | `.<hash>.css`, `.<hash>.js`, `.woff2`, `.ttf`, `.otf`, `.eot`     | `public, max-age=31536000, immutable` | 1 year                            |
| Images, favicon             | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`, `.svg`, `.ico` | `public, max-age=604800` (1 week)     | 1 year                            |
| HTML, feed, sitemap         | everything else                                                   | `public, max-age=0, must-revalidate`  | 1 year                            |
| Errors                      | any response with status >= 400                                   | passed through unchanged              | 1s (hashed assets) or 30s (other) |

The reasoning per class:

- fingerprinted assets are content-addressed, so the URL changes whenever the
  bytes change. They are safe to cache forever and never revalidate, even on a
  manual reload, which is what `immutable` instructs
- images and the favicon have stable URLs that change rarely. A week in the
  browser is a reasonable default; rename the file to bust the cache for an image
  that must change sooner
- HTML, the feed, and the sitemap have stable URLs whose contents change in
  place. `max-age=0, must-revalidate` makes the browser revalidate on every
  navigation, and the edge answers with a 304 from the GitHub Pages ETag until a
  deploy purges it, so a change appears on the next navigation
- an error is never pinned. A freshly-deployed hashed asset can 404 transiently
  while the origin propagates, and the browser will not re-request an
  immutable-by-URL stylesheet, so those 404s expire in 1s to avoid a visible
  unstyled window; other errors expire in 30s

`immutable` belongs only on content-addressed URLs. It is never applied to HTML,
where it would freeze a stale page in the browser with no way to revalidate.

## Content fingerprinting

`src/_data/assets.js` is the single source of truth for asset URLs. It reads each
CSS source, takes a sha256 of the bytes, keeps the first 12 hex characters, and
exposes a URL of the form `/css/<name>.<hash>.css`. Two consumers read that map
so the reference and the file can never drift:

- `src/css/css.11tydata.js` sets each stylesheet's output `permalink` to its
  hashed path, and throws an actionable build error if a stylesheet is added
  without registering it in `assets.js`
- `src/_includes/head.njk` writes the matching `<link>`

Any edit to a CSS source changes its hash, which changes its output URL, which
busts every cache the instant a new build ships. Minification is deterministic,
so hashing the source guarantees a new URL whenever the delivered bytes change.
The font files already carry content-hash filenames, so they need no build step;
the VCL gives them the immutable policy by file extension.

## Compression

GitHub Pages serves gzip or identity but never brotli, and Fastly only compresses
content it receives uncompressed. The setup in `infra/index.ts`:

- `productEnablement.brotliCompression = true` enables Fastly's Brotli product.
  This also makes Fastly's Accept-Encoding normalization keep the `br` token
  instead of collapsing it to gzip
- `infra/snippets/force-identity-fetch.vcl` unsets `bereq.http.Accept-Encoding` on
  both `miss` and `pass`, so the origin always returns identity and Fastly has
  uncompressed bytes to work with
- the `gzips` block lists the content types and extensions to compress

The edge then compresses to brotli for a capable client and gzip for the rest,
varying on `Accept-Encoding`. Already-compressed types such as woff2 are not in
the list, so they are served as-is rather than re-compressed. Savings over gzip
are modest on a site this small (roughly 6 to 7 percent), but brotli is the
better choice for any client that accepts it.

## Transport and security

The same Fastly service sets the rest of the edge behavior:

- HTTP/2 and HTTP/3 are enabled (`http3: true`). HTTP/3 is advertised through the
  `alt-svc` header so clients upgrade on a later connection
- TLS 1.3 and TLS 1.2 are both accepted. TLS 1.3 session resumption and 0-RTT
  early data are supported, so a returning client skips the full handshake and
  can send its first request a round trip early
- HSTS is set to `max-age=31557600` (one year) on responses
- HTTP is upgraded to HTTPS with a 301 (`forceSsl`)
- the apex `tollmanz.com` is redirected to the canonical `www.tollmanz.com` with
  a 301 that preserves the path and query, synthesized at the edge from the
  `apex-to-www-recv.vcl` and `apex-to-www-error.vcl` snippets

## How a deploy reaches the edge

Two pipelines fire on a push to `main`, each owning one half of the contract:

- `.github/workflows/pages.yml` builds the site and deploys it to GitHub Pages on
  any push to `main`, then runs `purge_all` against Fastly as its last step
- `.github/workflows/infra.yml` runs `pulumi up` when `infra/**` changes on a push
  to `main`, and `pulumi preview` on pull requests. The `site` resource is
  `protect: true`, which blocks replace and delete but allows the in-place updates
  these snippets need

The cache snippet runs on every origin fill, so a newly-filled object always gets
the current policy. An object cached just before a config change keeps its prior
TTL until it expires or is purged. After a site deploy the `purge_all` clears the
edge, so everything refills under the current VCL within seconds. An infra-only
change does not trigger the Pages purge, so after one either rely on the old
objects' natural expiry (the prior `max-age=600`, about ten minutes) or run a
one-time `purge_all` for instant convergence.

## Known tradeoffs

These were identified in review and accepted; the test suite validates the
production contract regardless of them:

- images are not fingerprinted. `src/media` is passthrough-copied with stable
  filenames, so an in-place image edit is invisible to returning visitors for up
  to a week. Rename the file to force an update sooner
- the HTML edge TTL is a year, kept correct only by the deploy purge. A missed
  purge could strand stale HTML at the edge with no natural expiry until the next
  deploy
- the CSS hash covers the raw source, not the minified bytes that ship. The two
  diverge only if a clean-css version or config change alters the output without
  any CSS edit, which always co-occurs with a deploy
- the dev server computes the CSS hash once at startup, so it serves a stale
  hashed URL after a CSS edit until restarted. Production is unaffected because CI
  always does a fresh single-pass build

## Verify by hand

```sh
# Cache-Control per class
curl -sI https://www.tollmanz.com/ | grep -i cache-control            # max-age=0, must-revalidate
curl -sI https://www.tollmanz.com/favicon.ico | grep -i cache-control # max-age=604800
CSS=$(curl -s https://www.tollmanz.com/ | grep -oE '/css/[a-z-]+\.[0-9a-f]+\.css' | head -1)
curl -sI "https://www.tollmanz.com${CSS}" | grep -i cache-control     # immutable

# 304 revalidation
ETAG=$(curl -sI https://www.tollmanz.com/ | awk 'tolower($1)=="etag:"{print $2}' | tr -d '\r')
curl -sI -H "If-None-Match: $ETAG" https://www.tollmanz.com/ | head -1 # 304

# Compression
curl -sI -H 'Accept-Encoding: br' https://www.tollmanz.com/ | grep -i content-encoding   # br
curl -sI -H 'Accept-Encoding: gzip' https://www.tollmanz.com/ | grep -i content-encoding # gzip

# HTTP/3 advertisement and TLS 0-RTT
curl -sI https://www.tollmanz.com/ | grep -i alt-svc                  # h3=":443"
openssl s_client -connect www.tollmanz.com:443 -tls1_3 -sess_out /tmp/s.pem < /dev/null >/dev/null 2>&1
printf 'GET / HTTP/1.1\r\nHost: www.tollmanz.com\r\nConnection: close\r\n\r\n' > /tmp/req.txt
openssl s_client -connect www.tollmanz.com:443 -sess_in /tmp/s.pem -early_data /tmp/req.txt 2>&1 | grep 'Early data'
```
