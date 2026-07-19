# Emit a Server-Timing header so the browser can see how long the backend took
# versus the edge. The RUM bundle reads the parsed metrics from the navigation
# PerformanceEntry (entry.serverTiming) and attaches them to the OpenTelemetry
# document-fetch span (see assets/rum/index.js). Server-Timing is exposed to
# same-origin script with no Timing-Allow-Origin needed, and the site is
# same-origin, so the browser populates entry.serverTiming automatically.
#
# This runs in vcl_deliver, which executes at both the customer-facing edge POP
# and the shield POP (the github-pages backend has a shield, so every origin
# fetch is concentrated through iad-va-us). The two nodes can measure different
# things, so each contributes the metric it can measure and the edge assembles
# the final header:
#
#   origin;desc=<state>;dur=<ms>  the shield POP's total processing time, which
#                                 is dominated by the fetch from GitHub Pages, so
#                                 it stands in for the origin response time (near
#                                 0 on a shield cache hit: the origin was not
#                                 contacted for this request)
#   edge;desc=<state>;dur=<ms>    total time this request spent inside the
#                                 customer edge POP, which includes the wait on
#                                 the backend when this request fetched through
#
# desc carries fastly_info.state (HIT, MISS, PASS, HIT-STALE, ...), so a reader
# can tell whether a duration reflects real backend work or a cache serve. Those
# values are Server-Timing token-safe, so desc is left unquoted.

# req.http.Fastly-FF is present only on a node that received the request from
# another Fastly node, which is the shield when the edge forwards to it. It is
# the standard way to tell the shield POP from the customer-facing edge POP.
if (req.http.Fastly-FF) {
  # Shield POP. time.elapsed here is this node's total processing time, which is
  # dominated by the fetch from GitHub Pages, so it stands in for the origin
  # response time. time.to_first_byte would be the more literal choice but has no
  # millisecond accessor and, in vcl_deliver, is within microseconds of
  # time.elapsed anyway. Send it back to the edge as the origin metric.
  set resp.http.Server-Timing = "origin;desc=" fastly_info.state ";dur=" time.elapsed.msec;
} else if (obj.hits > 0) {
  # Customer edge POP serving from its own cache. Any Server-Timing on the object
  # is a stale artifact captured when the object was filled, not this request's
  # backend timing, so discard it and report only this edge serve.
  set resp.http.Server-Timing = "edge;desc=" fastly_info.state ";dur=" time.elapsed.msec;
} else {
  # Customer edge POP that fetched through to the shield on this request, so the
  # origin metric forwarded from the shield describes this request. Preserve it
  # (absent only if the shield snippet has not yet deployed) and append the edge
  # total.
  if (resp.http.Server-Timing) {
    set resp.http.Server-Timing = resp.http.Server-Timing ", ";
  }
  set resp.http.Server-Timing = resp.http.Server-Timing "edge;desc=" fastly_info.state ";dur=" time.elapsed.msec;
}
