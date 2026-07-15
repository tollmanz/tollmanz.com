// Shared configuration for the edge verification suite.
//
// The suite asserts the live production contract documented in
// docs/edge-caching.md, so it points at the Fastly-fronted origin by default.
// Override EDGE_BASE_URL to run it against a different host (a staging Fastly
// service, say). The apex redirect test only runs when the base host is the www
// subdomain, since that is the only configuration where the redirect applies.

const rawBase = process.env.EDGE_BASE_URL || "https://www.tollmanz.com";
const baseUrl = rawBase.replace(/\/+$/, "");
const { hostname } = new URL(baseUrl);

export const config = {
  baseUrl,
  host: hostname,
  // www.tollmanz.com -> tollmanz.com. Used by the apex-to-www redirect test.
  apexHost: hostname.replace(/^www\./, ""),
  isWww: hostname.startsWith("www."),
};

// Cache-Control values the Fastly fetch snippet writes per asset class. These
// strings are set verbatim in infra/snippets/cache-control-fetch.vcl, so an
// exact-string assertion validates the VCL output rather than a loose set of
// directives.
export const cacheControl = {
  immutable: "public, max-age=31536000, immutable",
  revalidate: "public, max-age=0, must-revalidate",
  image: "public, max-age=604800",
};
