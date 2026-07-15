import * as fs from "fs";
import * as path from "path";
import * as pulumi from "@pulumi/pulumi";
import * as fastly from "@pulumi/fastly";
import * as command from "@pulumi/command";

// The site is served by GitHub Pages and fronted by Fastly. GitHub Pages is
// multi-tenant and routes purely by the HTTP Host header, so the backend's
// connection identity is deliberately decoupled from its routing identity:
//   - address / SNI / cert hostname = tollmanz.github.io (the github.io origin,
//     whose TLS cert is valid for *.github.io)
//   - overrideHost = www.tollmanz.com (the custom domain configured on the repo,
//     which selects this repo's site and avoids the github.io -> custom-domain
//     301 redirect)
// The custom domain must be set in the repo's Settings > Pages to match
// overrideHost. The Fastly API token is read by the provider from FASTLY_API_KEY;
// no secrets are committed. GitHub Pages is public, so no origin signing is
// needed.

// Custom VCL lives in ./snippets as plain .vcl files so the source is readable
// and exactly matches what runs at the edge. The apex-to-www redirect is split
// across a recv snippet (detects the apex Host and raises a sentinel error) and
// an error snippet (synthesizes the 301).
const snippetsDir = path.join(__dirname, "snippets");
const apexRedirectRecv = fs.readFileSync(
  path.join(snippetsDir, "apex-to-www-recv.vcl"),
  "utf8"
);
const apexRedirectError = fs.readFileSync(
  path.join(snippetsDir, "apex-to-www-error.vcl"),
  "utf8"
);
const cacheControlFetch = fs.readFileSync(
  path.join(snippetsDir, "cache-control-fetch.vcl"),
  "utf8"
);
const forceIdentityFetch = fs.readFileSync(
  path.join(snippetsDir, "force-identity-fetch.vcl"),
  "utf8"
);

const honeycombProxy = fs.readFileSync(
  path.join(snippetsDir, "honeycomb-proxy.vcl"),
  "utf8"
);

// Browser RUM telemetry is proxied to Honeycomb at the edge. The Honeycomb
// ingest key is created and owned by the Honeycomb Pulumi project; read it as a
// secret output here so there is a single source of truth and no manual copy
// step. The key is stored in the write-only "secrets" edge dictionary (declared
// on the service below), which is Fastly's secret management for VCL services:
// the proxy snippet reads it with table.lookup, so the key never appears in the
// committed source, the generated VCL, or the browser.
//
// Until the Honeycomb stack has been applied its ingestKey output is undefined;
// in that bootstrap window the dictionary is left empty, the snippet's lookup
// returns "" and POSTs to /v1/traces fall through to the origin (404). Apply
// infra/honeycomb, then re-run this stack to activate the proxy (see
// infra/README.md).
const honeycombStack = new pulumi.StackReference(
  "tollmanz-gmail-com/tollmanz-com-honeycomb/prod"
);
const honeycombIngestKey = honeycombStack
  .getOutput("ingestKey")
  .apply(key => (typeof key === "string" ? key : ""));

const site = new fastly.ServiceVcl(
  "site",
  {
    name: "www.tollmanz.com",
    comment: "",
    domains: [{ name: "tollmanz.com" }, { name: "www.tollmanz.com" }],
    backends: [
      {
        name: "github-pages",
        address: "tollmanz.github.io",
        port: 443,
        useSsl: true,
        shield: "iad-va-us",
        overrideHost: "www.tollmanz.com",
        sslCertHostname: "tollmanz.github.io",
        sslSniHostname: "tollmanz.github.io",
      },
      {
        // Backend for the browser RUM proxy. Only the "Honeycomb RUM proxy"
        // snippet selects this backend (explicit req.backend for POST
        // /v1/traces). The never-matching request condition keeps it out of
        // Fastly's generated default-backend selection: with two unconditioned
        // backends the generated VCL picks the default arbitrarily and could
        // route the whole site to api.honeycomb.io. overrideHost forces the
        // Host header so TLS and routing reach Honeycomb's OTLP endpoint.
        name: "honeycomb",
        address: "api.honeycomb.io",
        port: 443,
        useSsl: true,
        overrideHost: "api.honeycomb.io",
        sslCertHostname: "api.honeycomb.io",
        sslSniHostname: "api.honeycomb.io",
        requestCondition: "never",
      },
    ],
    conditions: [
      {
        // Never matches; exists solely to exclude the honeycomb backend from
        // generated backend selection. See the honeycomb backend above.
        name: "never",
        statement: "false",
        type: "REQUEST",
      },
    ],
    dictionaries: [
      {
        // Write-only (private) edge dictionary holding the Honeycomb ingest
        // key, read by the "Honeycomb RUM proxy" snippet via table.lookup.
        // Private dictionaries are Fastly's secret management for VCL
        // services: values are write-only through the API and never appear in
        // the generated VCL or version diffs. The provider cannot manage items
        // in a write-only dictionary, so the item itself is upserted by the
        // ingest-key sync command below.
        name: "secrets",
        writeOnly: true,
      },
    ],
    gzips: [
      {
        name: "Generated by default compression policy",
        contentTypes: [
          "text/html",
          "application/x-javascript",
          "text/css",
          "application/javascript",
          "text/javascript",
          "application/json",
          "application/vnd.ms-fontobject",
          "application/x-font-opentype",
          "application/x-font-truetype",
          "application/x-font-ttf",
          "application/xml",
          "font/eot",
          "font/opentype",
          "font/otf",
          "image/svg+xml",
          "image/vnd.microsoft.icon",
          "text/plain",
          "text/xml",
        ],
        extensions: [
          "css",
          "js",
          "html",
          "eot",
          "ico",
          "otf",
          "ttf",
          "json",
          "svg",
        ],
      },
    ],
    // Enable Fastly's Brotli Compression product. The gzips block above defines
    // which content types are compressed; with Brotli enabled, Fastly serves
    // brotli to capable clients and gzip to the rest, compressing at the edge.
    // Paired with the force-identity-fetch snippet below so the origin returns
    // uncompressed content for Fastly to compress: GitHub Pages never emits
    // brotli, and Fastly only compresses content it receives uncompressed.
    // Requires the account to be entitled to the Brotli product; if the apply
    // fails on enablement, request it from Fastly support.
    productEnablement: {
      brotliCompression: true,
    },
    headers: [
      {
        name: "Generated by force TLS and enable HSTS",
        action: "set",
        type: "response",
        destination: "http.Strict-Transport-Security",
        source: '"max-age=31557600"',
      },
    ],
    requestSettings: [
      {
        name: "Generated by force TLS and enable HSTS",
        forceSsl: true,
      },
    ],
    http3: true,
    snippets: [
      {
        // Priority below the apex redirect (100) so /v1/traces is proxied before
        // any host-based redirect, and its return(pass) keeps the request off the
        // GitHub Pages origin and out of cache.
        name: "Honeycomb RUM proxy",
        type: "recv",
        priority: 90,
        content: honeycombProxy,
      },
      {
        name: "Apex to www redirect",
        type: "recv",
        priority: 100,
        content: apexRedirectRecv,
      },
      {
        name: "Apex to www redirect response",
        type: "error",
        content: apexRedirectError,
      },
      {
        name: "Cache-Control by asset class",
        type: "fetch",
        priority: 100,
        content: cacheControlFetch,
      },
      {
        name: "Force identity fetch for edge compression - miss",
        type: "miss",
        priority: 100,
        content: forceIdentityFetch,
      },
      {
        name: "Force identity fetch for edge compression - pass",
        type: "pass",
        priority: 100,
        content: forceIdentityFetch,
      },
    ],
  },
  {
    protect: true,
  }
);

// Upsert the Honeycomb ingest key into the write-only "secrets" dictionary.
// The provider cannot manage items in a private dictionary (see the dictionary
// block above), so this shells out to the Fastly API. Dictionary items live
// outside service versions, so a key rotation updates the edge in place with
// no new VCL version. The command re-runs whenever its environment changes,
// i.e. when the Honeycomb stack rotates the key.
//
// FASTLY_API_KEY is read from the ambient process environment (root .env
// locally, GitHub Actions secret in CI), the same credential the provider
// uses; it is deliberately not passed through `environment` so it never enters
// Pulumi state. The ingest key does pass through `environment`, which reaches
// Pulumi Cloud state encrypted, exactly as the StackReference output already
// does. During bootstrap the key is "" and the command leaves the dictionary
// untouched.
const secretsDictionaryId = site.dictionaries.apply(
  dictionaries =>
    (dictionaries ?? []).find(d => d.name === "secrets")?.dictionaryId ?? ""
);

const syncIngestKey = [
  `if [ -z "$ITEM_VALUE" ]; then`,
  `  echo "Honeycomb stack has no ingestKey output yet; leaving the secrets dictionary untouched (see infra/README.md)."`,
  `  exit 0`,
  `fi`,
  `curl -fsS -X PUT \\`,
  `  "https://api.fastly.com/service/$SERVICE_ID/dictionary/$DICTIONARY_ID/item/honeycomb_ingest_key" \\`,
  `  -H "Fastly-Key: $FASTLY_API_KEY" \\`,
  `  --data-urlencode "item_value=$ITEM_VALUE" > /dev/null`,
  `echo "Upserted honeycomb_ingest_key into the secrets dictionary."`,
].join("\n");

new command.local.Command("honeycomb-ingest-key-item", {
  create: syncIngestKey,
  update: syncIngestKey,
  environment: {
    SERVICE_ID: site.id,
    DICTIONARY_ID: secretsDictionaryId,
    ITEM_VALUE: honeycombIngestKey,
  },
});

export const serviceId = site.id;
export const activeVersion = site.activeVersion;
