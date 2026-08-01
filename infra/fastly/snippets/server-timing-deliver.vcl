# Emit a Server-Timing header so the browser can attribute server-side latency.
# The RUM bundle reads the parsed metrics from the navigation PerformanceEntry
# (entry.serverTiming) and attaches them to the OpenTelemetry document-fetch span
# (see assets/rum/index.js). Server-Timing is exposed to same-origin script with
# no Timing-Allow-Origin needed, and the site is same-origin, so the browser
# populates entry.serverTiming automatically.
#
# Each metric name here is a FIELD name, not the node that measured it. The RUM
# maps them generically (desc becomes fastly.<name>, dur becomes
# fastly.<name>_ms), so the names chosen below are the attribute names that land
# in Honeycomb and a new field needs no JavaScript change. The browser surfaces
# only name, desc and dur from each metric, so one field carries at most one
# string and one number; a fact needing both is split across two fields. All
# values emitted here are Server-Timing token-safe, so desc is left unquoted.
#
#   pop;desc=<code>            customer-facing POP serving this visitor
#   region;desc=<region>       that POP's region, a fixed 16-value list
#   cache_status;desc=<state>  how deep into the stack the request went
#   total;dur=<ms>             total time inside Fastly, receipt to response
#   backend;dur=<ms>           time the shield spent fetching from GitHub Pages
#
# Fastly's own overhead is total minus backend.
#
# vcl_deliver runs at both the customer-facing edge POP and the iad-va-us shield
# POP (the github-pages backend is shielded, so every origin fetch is
# concentrated through the shield). The two nodes can measure different things,
# so the shield reports what only it can see and the edge assembles the final
# header.

declare local var.st_shield_state STRING;
declare local var.st_cache_status STRING;
declare local var.st_header STRING;

# req.http.Fastly-FF is present only on a node that received the request from
# another Fastly node, which is the shield when the edge forwards to it. It is
# the standard way to tell the shield POP from the customer-facing edge POP.
if (req.http.Fastly-FF) {
  # Shield POP. time.elapsed here is this node's total processing time, which is
  # dominated by the fetch from GitHub Pages, so it stands in for the backend
  # response time. time.to_first_byte would be the more literal choice but has no
  # millisecond accessor and, in vcl_deliver, is within microseconds of
  # time.elapsed anyway. Fastly-Shield-State rides back to the edge so it can
  # derive cache_status; the edge strips it before delivery.
  set resp.http.Server-Timing = "backend;dur=" time.elapsed.msec;
  set resp.http.Fastly-Shield-State = fastly_info.state;
} else {
  # Customer-facing edge POP. Read and strip the shield's internal header first
  # so it cannot reach the client down any path below. The header is absent
  # whenever no shield leg ran, so it is defaulted to the empty string rather
  # than left NOT SET, which keeps the match below a plain string comparison.
  set var.st_shield_state = if(
    resp.http.Fastly-Shield-State,
    resp.http.Fastly-Shield-State,
    ""
  );
  unset resp.http.Fastly-Shield-State;

  # cache_status is derived to a single value so one Honeycomb group-by answers
  # "how deep did this request go". The tradeoff is that an edge state and a
  # shield state cannot both be reported: an edge HIT-STALE served over a shield
  # MISS collapses into the edge's own state.
  if (obj.hits > 0) {
    # This POP answered from its own cache, so the shield was never consulted on
    # this request. Any backend metric or shield state stored alongside the
    # object is a stale artifact of the fill, describing whichever request
    # happened to populate the cache, so discard both.
    unset resp.http.Server-Timing;
    set var.st_cache_status = fastly_info.state;
  } else if (var.st_shield_state ~ "^HIT") {
    # Fetched through, but the shield answered from its own cache, so GitHub
    # Pages was never contacted. A bare edge MISS would hide this.
    set var.st_cache_status = "SHIELD_HIT";
  } else {
    # Fetched through to GitHub Pages (MISS), or uncacheable (PASS). This also
    # covers the visitor whose nearest POP is the shield itself: Fastly skips the
    # redundant hop there, so one node plays both roles, Fastly-FF is unset, and
    # no backend metric exists even though the origin was contacted.
    set var.st_cache_status = fastly_info.state;
  }

  # Assemble the edge's own metrics in a local. Reading a NOT SET header inside
  # a concatenation yields the literal string "(null)", and Server-Timing is
  # unset on every path where no shield metric survives (an edge HIT above, and
  # any synthetic response such as the apex redirect), so the header is never an
  # operand here.
  set var.st_header = "pop;desc=" server.datacenter
    ", region;desc=" server.region
    ", cache_status;desc=" var.st_cache_status
    ", total;dur=" time.elapsed.msec;

  # Preserve the shield's backend metric when it describes this request; the
  # branches above have already dropped it when it does not.
  if (resp.http.Server-Timing) {
    set var.st_header = resp.http.Server-Timing ", " var.st_header;
  }

  set resp.http.Server-Timing = var.st_header;
}
