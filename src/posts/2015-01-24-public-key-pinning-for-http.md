---
layout: post.njk
title:      "Implementing Public Key Pinning"
date:       2015-01-25 20:25:00
categories: security
permalink: /public-key-pinning-for-http/
---

This weekend, I implemented public key pinning on my website. While implementing the pins, I ran into a few gotchas that I want to share. There are many excellent articles on the topic already (see [below](#reading-list) for a short annotated list of), so I won't attempt to go into detail about the concepts of public key pinning; rather, I'll communicate my experiences in order to help other developers.

### What is Public Key Pinning?

The Public Key Pinning Extension for HTTP (HPKP) allows a website owner to provide a browser with an ID or "pin" for the public key used for her website. After a visitor browses to the website, the pin is saved by the browser. This pin is used to verify the public key for the site on subsequent visits. It is a mechanism that reduces the attack surface for man-in-the-middle (MITM) attacks against TLS websites. More specifically, it protects against attacks in which a fake certificate is issued for your website, allowing an attacker to imitate your website (and these are [not](https://nakedsecurity.sophos.com/2013/01/08/the-turktrust-ssl-certificate-fiasco-what-happened-and-what-happens-next/) [without](http://www.techworld.com/news/security/digitally-signed-malware-is-increasing-since-stuxnet-say-researchers-3345028/) [precedent](https://www.vasco.com/company/about_vasco/press_room/news_archive/2011/news_diginotar_reports_security_incident.aspx)). Currently, pinning only works in Chrome 38+ and Firefox 35+.

### My Experiences with Pinning

HPKP requires that you send a header with the HTTP response that includes the pinning information. Taken straight from [Mozilla](), the header looks like:

```bash
Public-Key-Pins: pin-sha256="base64=="; pin-sha256="base64=="; max-age=expireTime [; includeSubdomains][; report-uri="reportURI"]
```

The header provides the pinning information, a time-to-live (TTL) for the pins, and optionally an "includeSubDomains" and "report-uri" directive. It's easy enough to send a header with Nginx (my webserver software), but finding out how to generate the pins took some looking around.

HPKP requires deploying multiple pins in order to have a backup public key in case you have to revoke your current key. With this in mind, I decided to buy a second certificate from my website. To be honest, I've been really wanting to try [SSLMate](https://sslmate.com/), a command line based certificate management system, so I used this occasion as an excuse to try it out (and it was wonderful!).

With two fully functionally certificates from two independent CAs with independent root certificates, I needed to figure out what certificate's public key to hash using the SHA-256 hashing algorithm. To clarify, HPKP only requires that a *single public key* in the full certificate chain is pinned. You can choose which keys to pin. I decided to create pins out of the intermediate certificate's public keys for each CA. I decided not to hash my public key in order to make it easier to reissue my certificate if necessary. This decision was based on the fact that I want to experiment with regular certificate rotation, so I thought it would be better to not hash my certificate.

I grabbed the cert that I needed and hashed it:

```bash
openssl x509 -in www.tollmanz.chain.crt -pubkey -noout | \
openssl rsa -pubin -outform der | \
openssl dgst -sha256 -binary | \
base64
```

This produced the following hash:

```bash
klO23nT2ehFDXCfx3eHTDRESMz3asj1muO+4aIdjiuY=
```

I followed this up by repeating the same process for my backup certificate's CA's intermediate certificate, which produced the following hash:

```bash
6X0iNAQtPIjXKEVcqZBwyMcRwq1yW60549axatu3oDE=
```

Because I wanted to be careful and not block visitors (in other words, myself) while I worked on this, I set the max-age for the pins to only 10 seconds. A bad configuration would only block me for 10 seconds if I made a mistake.

I went ahead and added the following `add_header` statement to my Nginx config:

```bash
add_header    Public-Key-Pins 'pin-sha256="klO23nT2ehFDXCfx3eHTDRESMz3asj1muO+4aIdjiuY="; pin-sha256="6X0iNAQtPIjXKEVcqZBwyMcRwq1yW60549axatu3oDE="; max-age=10; includeSubDomains';
```

Sure enough, this produced the expected header when visiting my website; however, nothing really changed about my site. The problem with a change like this is that if you get the configuration right, there is no clear positive affirmation of your work. I actually actively tried to break the pinning for some time so I could see the difference between a good and bad HPKP implementation. Unfortunately, this was actually quite difficult. I couldn't get Chrome or Firefox to produce a report for any `report-uri` that I added. Additionally, only Firefox would give me a vague message about a misconfiguration, but would still allow me to access my site.

After enough tinkering, I finally was able to get myself blocked by making the browser think that I was MITM'ed. I then came across a nice method for verifying whether or not the pinning information is properly recorded.

Chrome provides an [internal diagnostic page](chrome://net-internals/#hsts) for viewing HTTP Strict Transport Security (HSTS) information. Since HSTS and HPKP are related subjects, it turns out that this page also includes HPKP information (this isn't documented very well). If you visit this page, there is a field that allows you to "query" a domain and get HSTS and HPKP information about the domain. Once you have set up HPKP and visited your site, you should see something like the following if you query your domain:

![](/media/images/domain-query-hpkp.jpg "Results of domain query for HSTS and HPKP information")

Most importantly, you'll want to see values for `dynamic_pkp_observed` and `dynamic_spki_hashes`. If values are reported here, you have affirmation that the browser has stored your public key pins. If you are still able to access your site, you know that the pins are stored and they are correct other wise you would be presented with a connection error screen.

After confirming that all of this worked, I set my `max-age` value to 180 days as that seemed sufficient to me.

So, to sum this up, HPKP can be implemented with the following steps:

1. Decide which certificate's public keys you will pin
1. Create SHA-256 hashes for the public keys
1. Set your site to send a header with the pins
1. Visit your site multiple times to verify that you are not blocked
1. Check [chrome://net-internals/#hsts](chrome://net-internals/#hsts) and query your domain to verify that the pins are stored

### Last Thoughts

If you are not clear on what HPKP is at this point, that is ok. I prefer that you [read what others have written](#reading-list) to get a better grasp on the subject. This article serves as some notes about my experiences that will hopefully help others. I think the main thing missing in other guides is a clear way to figure out if the browser truly is storing your pins. I hope this helps you as you work to secure your site!

### Reading List

I found some excellent articles that helped me with setting up pinning and wanted to share an annotated reading list if you are interested in the subject.

* [Everything you Need to Know about HTTP Public Key Pinning](http://blog.rlove.org/2015/01/public-key-pinning-hpkp.html) - Robert Love: Robert really nails the primary concept of HPKP. He writes in a clear, matter of fact matter that allows you to really understand the subject. He finishes by providing a great guide to implementing HPKP.
* [HTTP Public Key Pinning Explained](https://timtaubert.de/blog/2014/10/http-public-key-pinning-explained/) - Tim Taubert; Tim's article dives much deeper into the internals of what a certificate contains and what is used to generate a pin. After reading his article, I had a much better sense of what is actually "pinned". I also really appreciated his exploration of the need for a backup key and the situations in which your key might be revoked. In fact, this article influenced me to pin my CA's intermediate certs, not my cert.
* [HTTP Public Key Pinning Extension HPKP for Apache, NGINX and Lighttpd](https://raymii.org/s/articles/HTTP_Public_Key_Pinning_Extension_HPKP.html) - Remy van Elst; Remy's article did not provide much beyond the first two articles, but reaffirmed my decision of what to pin. I also really liked the source material from Adam Langley that he highlighted.
* [Public Key Pinning](https://developer.mozilla.org/en-US/docs/Web/Security/Public_Key_Pinning) - Mozilla; I really enjoy the Mozilla Developer Network articles, especially ones on TLS. This one is straight to the point and is a great guide for how to set up pinning if you do not want to be too bogged down by theory.
* [JavaScript Public-Key-Pins (HPKP) calculator v1.0.2](https://projects.dm.id.lv/s/pkp-online/calculator.html) - Dāvis Mošenkovs: Dāvis wrote a really helpful tool for creating your pins. He even automates creating the header if you want. I found this useful for verifying my commands for creating hashes as well as easily seeing the pins for each cert in my certificate chain.
