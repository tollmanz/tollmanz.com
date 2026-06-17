# Redirect the apex domain to the canonical www host. This matches the original
# client Host: overrideHost only rewrites the backend request, so tollmanz.com is
# caught here while www.tollmanz.com passes through untouched. The 301 itself is
# synthesized in the paired error snippet.
if (req.http.host == "tollmanz.com") {
  error 751 "apex to www redirect";
}
