---
layout:     post
title:      "Handling 415 (Unsupported Content-Type) Errors in Hapi"
date:       2015-07-26 19:30:00
categories: node, http, hapi
slug:       hapi-415-unsupported-media-type
---

I am working on a project related to Content Security Policy (CSP) reports. As part of this project, I need to record POST requests made by Chrome that are initiated whenever a CSP policy is violated. When Chrome sends these reports, they send the following header:

```bash
Content-Type: application/csp-report
```

The body of the request is very basic JSON.

The application that I wrote to handle these POST requests is written in Node using the [Hapi](http://hapijs.com/) framework. I set up a simple route to handle the request:

```javascript
server.route({
  method: 'POST',
  path:'/csp-report',
  handler: function (request, reply) {
    // Record the request
  }
});
```

All browsers other than Chrome worked just fine; however, Chrome produced a `415` HTTP response when the endpoint was invoked. Other browsers use a content type of `application/json`, whereas Chrome uses `application/csp-report`. A `415` HTTP status code stands for "Unsupported Media Type". Simply put, the server cannot handle this unknown media type. I tried a number of ways of getting the server to support the media type, but the best result led to the content being parsed incorrectly, making the previously usable JSON a jumbled mess.

My solution to this issue was to map `application/csp-report` to `application/json`. In the end, the content really is just JSON, so there is no point in maintaining this content type.

To accomplish this goal, I utilized the `onRequest` event to map the content type:

```javascript
server.ext('onRequest', function(request, reply) {
  if ('application/csp-report' === request.headers['content-type']) {
    request.headers['content-type'] = 'application/json';
    request.headers['x-content-type'] = 'application/csp-report';
  }

  return reply.continue();
});
```

This snippet catches the request before it is passed to the routes. If I find the `application/csp-report` content type, I simply change it to `application/json`. I also set a new `x-content-type` header to record the original content type in case I ever need that information in the future.

One small note is that `reply.continue()` was well documented in the Hapi docs; however, I found many other tutorials and snippets handling this incorrectly. I suspect that this difference is due to an API change at some point, so your mileage may vary with that call.

There's nothing spectacular in this code, but I really couldn't find any useful information about how to handle this issue. Hopefully this helps some wayward soul in the future.
