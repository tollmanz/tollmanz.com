# Rewrite cache lifetimes at the edge. GitHub Pages labels every response
# Cache-Control: max-age=600, which is at once too short for fingerprinted
# assets and too long in the browser for stable-URL HTML. Each asset class is
# given the right policy here.
#
# beresp.ttl is Fastly's own object lifetime; it is set explicitly (not derived
# from the delivered Cache-Control) so the edge caches every asset class for a
# year regardless of what the browser is told. The edge is kept fresh by the
# purge-all that runs after every Pages deploy, so a long edge TTL never serves
# stale content. The delivered Cache-Control is what reaches the browser.
#
# This runs in vcl_fetch, after the Fastly boilerplate has already derived a TTL
# from the origin headers, so these assignments override that derivation. It runs
# at both the edge and the shield POP; the rewrite is idempotent, so a second
# pass over an already-rewritten response yields the same result.

if (beresp.status >= 400) {
  # Never pin an error response: expire it fast so a fix is picked up on the next
  # request rather than cached for a year. A fingerprinted asset can 404
  # transiently while a deploy propagates to the origin, and the browser will not
  # re-request an immutable-by-URL stylesheet, so pin those for only a second to
  # avoid a visible unstyled window for freshly-deployed visitors.
  if (
    req.url.path ~ "(?i)\.[0-9a-f]{8,}\.(?:css|js)$" ||
    req.url.path ~ "(?i)\.(?:woff2?|ttf|otf|eot)$"
  ) {
    set beresp.ttl = 1s;
  } else {
    set beresp.ttl = 30s;
  }
} else if (
  req.url.path ~ "(?i)\.[0-9a-f]{8,}\.(?:css|js)$" ||
  req.url.path ~ "(?i)\.(?:woff2?|ttf|otf|eot)$"
) {
  # Content-addressed assets: fingerprinted CSS/JS (name.<hash>.ext) and the
  # content-hashed font files. The URL changes whenever the bytes change, so
  # these are safe to cache forever and never revalidate, even on reload.
  set beresp.ttl = 31536000s;
  set beresp.http.Cache-Control = "public, max-age=31536000, immutable";
} else if (req.url.path ~ "(?i)\.(?:jpe?g|png|gif|webp|avif|svg|ico)$") {
  # Images and the favicon: stable URLs that change rarely. Cache a week in the
  # browser; the edge holds them long and the deploy purge refreshes the edge
  # copy if one is ever replaced in place. Rename the file to bust the browser
  # cache for an image that must change before the week is out.
  set beresp.ttl = 31536000s;
  set beresp.http.Cache-Control = "public, max-age=604800";
} else {
  # HTML plus the XML feed and sitemap: stable URLs whose contents change in
  # place. The browser revalidates on every use; Fastly answers with a 304 from
  # the origin ETag until a deploy purges the edge, so a change is visible on the
  # next navigation. The body stays cached long at the edge to keep that
  # revalidation a cheap 304 rather than an origin round trip.
  set beresp.ttl = 31536000s;
  set beresp.http.Cache-Control = "public, max-age=0, must-revalidate";
}
