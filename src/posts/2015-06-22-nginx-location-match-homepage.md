---
layout: post.njk
title:      "Matching a Homepage (or \"/\" or \"/index.html\" ) with Nginx Location Blocks"
date:       2015-06-22 22:00:00
categories: nginx, location
permalink: /nginx-location-match-homepage/
---

I have been doing a lot of experimenting with my website lately. Recently, I was trying to configure some special rules for my website's homepage. In Nginx, I wanted to match requests for the homepage only. When I looked in the access log, requests for *https://www.tollmanz.com* are registered as `/`. The excerpted headers for the request looks like:

```bash
authority: www.tollmanz.com
method: GET
path: /
scheme: https
```

Given that the path for the homepage is simply `/`, I added the location to my configuration. A heavily excerpted configuration looked something like:

```bash
server {
    listen         443 ssl;
    server_name    www.tollmanz.com;
    root           /path/to/tollmanz.com/;

    # Match homepage
    location = / {}

    # Match assets
    location ~* \.(?:ico|css|js|gif|jpe?g|png|woff2|woff|ttf)$ {}

    # All other files
    location / {}
}
```

I set up three locations: homepage, assets, and all other files. Nginx [docs](http://nginx.org/en/docs/http/ngx_http_core_module.html#location) are very clear that `location = / {}` would match `/` over `location / {}` because it is *more specific* and should therefore take precedence; however, that absolutely did not work with any amount of trying.

After a ton of searching, I finally stumbled upon the [`index` directive docs](http://nginx.org/en/docs/http/ngx_http_index_module.html). In an aside at the end of the page, it mentions:

> It should be noted that using an index file causes an internal redirect, and the request can be processed in a different location... a "`/`" request will actually be processed in the second location as "`/index.html`".

By default, the `index` directive is set to display the `index.html` file. Since my site is a Jekyll site, all of the pages are `index.html` files within a specific directory. When I thought I needed to match `/`, I actually needed to match `/index.html`. Since Nginx by default will look for an `index.html` file inside of a directory request, I had to update my location to specifically match `/index.html`, even though the logs only suggest that I'm trying to match `/`. I needed to update my config to:

```bash
server {
    listen         443 ssl;
    server_name    www.tollmanz.com;
    root           /path/to/tollmanz.com/;

    # Match homepage
    location = /index.html {}

    # Match assets
    location ~* \.(?:ico|css|js|gif|jpe?g|png|woff2|woff|ttf)$ {}

    # All other files
    location / {}
}
```

This configuration makes a lot of sense in the end, but it was terribly confusing to work out. I *really* hope this note-to-self saves someone time in the future.
