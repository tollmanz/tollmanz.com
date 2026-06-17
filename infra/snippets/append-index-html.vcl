# Handle directory requests - both with and without trailing slash
if (req.url.path ~ "\/$") {
  # Path ends with / - append index.html
  set req.url = regsub(req.url, "\/$", "/index.html");
} elsif (req.url.path !~ "\." && req.url.path != "/") {
  # Path has no extension and isn't root - append /index.html
  set req.url = req.url.path "/index.html" if(req.url.qs, "?" req.url.qs, "");
}

# Special handling for root path
if (req.url.path == "/" || req.url.path == "") {
  set req.url = "/index.html" if(req.url.qs, "?" req.url.qs, "");
}