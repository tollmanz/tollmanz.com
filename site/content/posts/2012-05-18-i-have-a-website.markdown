---
layout:     post
title:      "I Have a Website"
date:       2012-05-18 03:30:00
categories: site
---

About 8 years ago, I helped build a website for the ridiculously under appreciated band (and now defunct), [Hope of the States](http://www.youtube.com/watch?v=CVjvz9zSxNs "Black Dollar Bills"). In a youthful attempt to feel important, I became overly involved with the site and moved it to a fully dynamic website driven by PHP and MySQL. It was an amazing feeling to know that I could put something on the internet that other people could use. Fast forward to today, I am finally putting my own website on the internet.

As I open the doors to this site, I am again excited about the technology. The site is running on a Linode server using Ubuntu 11.10, PHP-FPM, MySQL, and Nginx. I am using Memcached as a persistent object cache with Batcache serving as the page cache. Evan Solomon wrote an excellent article about spinning up a Linode server for [faster WordPress](http://evansolomon.me/notes/faster-wordpress-multisite-nginx-batcache/ "Faster WordPress: Multisite, nginx, and Batcache") that served as my basis for my sysadmin work. I opted to use Memcache as my object cache instead of APC primarily because I am more familiar with it. I doubt it would make much difference on a single server, light traffic site. Yes, this is all overkill for a little site, but now I have a killer testing ground for implementing some awesome WordPress things.

In addition to the server technology, I went to great strides to minimize adding unnecessary code to the frontend. I am proud to say that the only JS file added to the site for non-logged in users is the standard Google Analytics code. I even wrote functionality to locally cache GitHub gists to avoid the extra weight of enqueuing another JS file or files on the site. I am contemplating adding social media buttons, but with most implementations, the overhead is not worth the degraded user experience. I heavily cached things that should not be a burden to the reader (e.g., pseudo-breadcrumbs). I am currently only using one plugin, Akismet. I will likely add more plugins as I further build out the site.

When creating the theme, I was very inspired by [Readability](http://www.readability.com/ "Readability"). I really appreciate how these services focus on the important part of webpages--the content. Similarly, I would like this site to draw people in because of the content and them keep them here because that content is simple to engage. 

For whatever reason, I could not help thinking about all of the open source software that this site stands on while I was developing it. Because I often work for individuals who are paying me to build sites using this technology, I often forget the fact that so much of the "materials" are free and exist because of others' hard work. I am pleased that I thought about that while developing this site and am so appreciate to everyone who has played a part in building this site and billions of others around the internet.

It has been a long journey to this point and I am so excited to finally say I have my own WordPress site.