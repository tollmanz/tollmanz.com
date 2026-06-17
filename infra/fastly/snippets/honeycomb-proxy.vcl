# Route browser RUM telemetry to Honeycomb. The site posts OpenTelemetry traces
# to the same-origin path /v1/traces. This injects the ingest key server-side, so
# it never ships to the browser, then sends the request straight to the Honeycomb
# backend. Same-origin means no CORS and no preflight. The key placeholder is
# replaced at deploy time with the secret read from the Honeycomb Pulumi stack.
#
# Runs before the "Append index.html" snippet (lower priority value). The
# return(pass) ends vcl_recv, so that snippet never rewrites /v1/traces, and the
# POST is never cached.
if (req.url.path == "/v1/traces") {
  if (req.method == "POST") {
    set req.backend = F_honeycomb;
    set req.http.x-honeycomb-team = "__HONEYCOMB_INGEST_KEY__";
    return(pass);
  }
  error 405 "Method Not Allowed";
}
