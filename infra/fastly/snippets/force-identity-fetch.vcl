# GitHub Pages serves gzip or identity but never brotli, and Fastly only
# compresses content it receives uncompressed from origin. Strip the backend
# Accept-Encoding so the origin returns identity on every cache fill, letting
# Fastly compress to gzip or brotli at the edge to match the client's
# (normalized) Accept-Encoding. Applied in both miss and pass so cacheable and
# uncacheable fetches behave the same.
unset bereq.http.Accept-Encoding;
