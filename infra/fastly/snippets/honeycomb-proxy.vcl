# Route browser RUM telemetry to Honeycomb. The site posts OpenTelemetry traces
# to the same-origin path /v1/traces. The ingest key lives in the write-only
# "secrets" edge dictionary (Fastly's secret management for VCL services), so it
# is injected server-side and never ships to the browser, the committed source,
# or the generated VCL. Same-origin means no CORS and no preflight.
#
# Runs before the apex-to-www redirect snippet (lower priority value). The
# return(pass) ends vcl_recv, so telemetry is proxied before any host-based
# redirect and the POST is never cached.
if (req.url.path == "/v1/traces") {
  if (req.method == "POST") {
    declare local var.honeycomb_key STRING;
    set var.honeycomb_key = table.lookup(secrets, "honeycomb_ingest_key", "");
    if (var.honeycomb_key != "") {
      set req.backend = F_honeycomb;
      set req.http.x-honeycomb-team = var.honeycomb_key;
      return(pass);
    }
    # Bootstrap: the dictionary has no key yet, so fall through to the origin
    # (which has no /v1/traces and returns 404) rather than posting to
    # Honeycomb unauthenticated.
  } else {
    error 405 "Method Not Allowed";
  }
}
