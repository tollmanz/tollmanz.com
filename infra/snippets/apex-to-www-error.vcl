# Synthesize the 301 for the apex-to-www redirect raised in vcl_recv. req.url
# carries the path and query string, so both are preserved in the redirect. The
# Location is the canonical https www host, so an http apex request lands on the
# final URL in a single hop.
if (obj.status == 751) {
  set obj.status = 301;
  set obj.response = "Moved Permanently";
  set obj.http.Location = "https://www.tollmanz.com" req.url;
  set obj.http.Cache-Control = "max-age=3600";
  synthetic "";
  return(deliver);
}
