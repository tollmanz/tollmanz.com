---
layout:     post
title:      "WordPress HTTPS Mixed Content Detector Plugin"
date:       2015-01-01 16:00:00
categories: security
---

A critical component of deploying a secure website with TLS is ensuring that assets loaded on the site are secured with TLS/SSL. Web browsers will issue a [mixed content notice](https://developer.mozilla.org/en-US/docs/Security/MixedContent) (sometimes blocking your site) when this happens. Securing the primary domain and not the individual assets leaves you open to all of the nasty attacks that you are open to without TLS (e.g., man-in-the-middle, cookie cutter, passive monitoring). In WordPress, this can be particularly difficult to achieve because assets are loaded from content, plugins, themes, and WordPress core itself. With all of these possible sources of unsecured assets, I decided to create a plugin to assist in identifying mixed content issues for a WordPress based site.

My [HTTPS Mixed Content Detector](https://wordpress.org/plugins/https-mixed-content-detector/) ([Github](https://github.com/tollmanz/wordpress-https-mixed-content-detector)) WordPress plugin attempts to log unsecured assets to help you deploy a fully secured WordPress site. Once activating the plugin and browsing the site as an admin, a list of unsecure items will be generated for review in the admin dashboard. Admins can review this list and swap out these unsecure assets with their secure counterparts.

### Getting Started

To use the HTTPS Mixed Content Detector plugin, simply install it from the [WordPress plugin repository](https://wordpress.org/plugins/https-mixed-content-detector/). Once the plugin is installed, browse the front end of your website as a logged in admin using either Safari or Chrome (Firefox will not work right now<span class="footnote-article-number">1</span>). As you browse your site, any unsecure assets will be logged. I recommend starting off by browsing the primary templates for your site (e.g., home page, single post, single page, category page, tag page, etc). Once you have visited a number of pages on your site, click the "Content Security Policy Reports" menu item in your WordPress dashboard. You will see a list of all of the unsecure items served on the pages that you visited. For example, you might see something like:

![](/media/images/csp-violations.jpg "CSP Violations screen")

When you are finished logging reports, simply deactivate the plugin. There currently is no "on/off" switch, so just deactivate it.

### How it Works

The plugin uses the *[Content-Security-Policy-Report-Only](http://w3c.github.io/webappsec/specs/content-security-policy/#iana-content-security-policy-report-only)* header to set a "report only content policy" that creates an alert if assets served from unsecure location attempt to load from your website. The *Content-Security-Policy-Report-Only* header allows you to set a "report-uri" to send a notice about unsecure content. The plugin sends this to a special URL on your website. When that URL is pinged with a report of a content violation, it will log the violation for you to view at a later date.

Since this plugin is only setting the *Content-Security-Policy-Report-Only* header, and not the *Content-Security-Policy* header, *all assets will still be allowed* (although browsers may block the asset based on default browser behavior); however, any unsecure assets will be reported. The beauty of this arrangement is that you can deploy this plugin *before you deploy TLS* on your site to find the unsecure resources and fix them before they cause issues.

Note that this will only work for logged in admins. This allows the code to set a nonce to protect the "report-uri" from being pinged by unauthorized HTTP requests. If this was not locked down to logged-in, nonce-verified admins, it would represent both a security and self-DoSing risk. High traffic sites would crumble under the weigh of all of the SQL inserts from reports. In its current state, the plugin should be able to be deployed on high traffic websites without issue.

**Why Content Security Policy?**

I thought a lot about this plugin before I wrote it. I wanted to find a reliable way of detecting and reporting mixed content warnings. My initial idea was to regex the HTML for a page to find unsecure assets (i.e., assets that started with "http://"). The problem with that approach is that many assets would be missed. In my experience, I find that a lot of the unsecure content comes from third party scripts that load assets, that load assets, that load even more assets. Along that path, if one of those assets is unsecure, I would get a mixed content warning. Simply looking at the HTML of a page would not cut it.

Fortunately for us web developers, the content security policy for a website is constantly monitored by a web browser. I literally have to write 0 lines of code to handle the monitoring of the content. I just have to tell the browser the policy to monitor. Content security policy turned out to be an excellent choice for this plugin and makes logging these unsecured pieces of content a breeze.

### The Future

This plugin is only the beginning of what can be a powerful tool for assisting in finding mixed content on a WordPress site. One major caveat though is that it currently only works for logged in admins. I hope to add another mode that will allow sampling of real traffic. There are security and scaling implications for this mode and I want to work out the best way to handle that before real traffic can be observed.

Currently, the content security policy that is set is really basic; reports are only issued for non-https assets. For some users, it would be more useful to dial in a [more specific policy](http://w3c.github.io/webappsec/specs/content-security-policy/#directives) to test much more secure deployments (e.g., only allow assets for the main domain and whitelisted CDN provider). As an example, I use the following content security policy on my website:

```bash
Content-Security-Policy: default-src 'self' https:; font-src https://fonts.gstatic.com; img-src 'self' https:; style-src 'self' https: https://fonts.googleapis.com; script-src 'self' https: https://ssl.google-analytics.com
```

This is a little hard to read, but breaks down to the following rules:

* Fonts can only be loaded from `https://fonts.gstatic.com`
* Images can only be loaded from `https://www.tollmanz.com`
* CSS files can only be loaded from `https://www.tollmanz.com` and `https://fonts.googleapis.com`
* JS files can only be loaded from `https://www.tollmanz.com` and `https://ssl.google-analytics.com`
* Anything else that does not fall into these categories must be from `https://www.tollmanz.com`
* Inline styles and scripts are not allowed (XSS protection)

It makes sense that many users might want to dial in a more secure policy like this. Fortunately, adding this flexibility to the plugin just requires adding an option to specify your own content security policy. The browser handles the rest! I plan to add this flexibility in the future.

Finally, I am not wild about how reports are displayed in the admin. I am simply using the default list table for a custom content type in WordPress. I would like to have a more well designed interface for easily seeing unsecure content. Additionally, because the reports give you information about where the content was loaded from, I would like to be able to show "stack traces" for unsecure content. For instance, if a snippet of 3rd party JS loads JS, that loads JS, that loads an unsecure image, using the backtrace would help figure out that the 3rd party JS you added to your site is ultimately responsible for the security issue. If any designers want to help with that, let me know!

### Last Thoughts

This is a first release and I would appreciate any feedback that you have. Please feel free to report any issues to me on [Github](https://github.com/tollmanz/wordpress-https-mixed-content-detector/issues). I also encourage you to take some time to read about [content security policy](http://www.html5rocks.com/en/tutorials/security/content-security-policy/). It is an excellent tool for securing your website that is simple to grasp and deploy. If you do not have experience with it, I invite you learn about it now.

<p class="footnote"><span class="footnote-footer-number">1</span> Since the success of recording the report requires that cookies are sent along with the request, reports originating from Firefox do not work. Firefox does not send cookies along with the request, which is necessary for WordPress to authenticate the user. I hope to release an update in the future that does not have the authentication requirement, which will allow successful Firefox reports.</p>
