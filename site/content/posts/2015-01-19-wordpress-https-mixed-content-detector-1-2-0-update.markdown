---
layout:     post
title:      "Violation Locations and Sampling Mode in HTTPS Mixed Content Detector 1.2.0"
date:       2015-01-19 11:30:00
categories: security
---

Last night, I finished work on an update to [HTTPS Mixed Content Detector](https://wordpress.org/plugins/https-mixed-content-detector), which includes violation location detection and sampling mode, two features that make the plugin a more powerful tool for finding those frustrating mixed content warnings in your WordPress site.

### Violation Locations

The violation locations feature attempts to identify how the mixed content warning was introduced to the site. Did an author add an "http" URL to a post? Does a shortcode transform safe data attributes into a mixed content warning? Is your theme enqueuing scripts and styles from non-secure locations? HTTPS Mixed Content Detector uses violation locations to investigate where the mixed content originated to assist you in fixing the issue.

Currently, the plugin checks the following locations for a violation:

* **Shortcodes** (search every registered shortcode individually and will identify the violating shortcode)
* **Autoembeds**
* **Raw content**
* **Fully filtered content** (i.e., content after passed through the "the_content" filter)
* **Script enqueues**
* **Style enqueues**

The locations are identified when a CSP report is received. Additionally, if you already have a list of violations and need to run them through the violation location engine, you can do so with WP CLI:

```bash
wp mcd locate --all
```

Once the location data is set, you can view it in the admin screen:

![](/media/images/csp-violations-1-2-0.jpg "CSP violations with locations")

Alternatively, it can be viewed via the command line with WP CLI:

![](/media/images/wp-mcd-list-1-2-0.jpg "List command with locations")

These violation locations are just a start. The plugin will not find all sources of violations yet, but with continued work, it will get better. Furthermore, the violation locations API is developed with extensibility in mind so you can add your own violation locations. I will work to fully document this in the future, but if you are curious, the [violation location interface](https://github.com/tollmanz/wordpress-https-mixed-content-detector/blob/master/src/violation-locations/violation-location-interface.php) will clue you into how it works.

### Sampling Mode

One major limitation of previous versions of the plugin was that it only worked for admins browsing the site using Chrome or Safari. With sampling mode, this limitation can be removed. Sampling mode offers the ability to receive traffic to the beacon (the agent that collects CSP reports) for non-admins. Anyone browsing your website can generate these reports. Without authentication, CSP reports generated via Firefox will now work.

This mode might seem like a no-brainer; wouldn't we want to get reports whenever they happen? In a perfect world, yes, we would; however, there are significant performance, scaling, and security concerns with opening up this beacon universally. Sampling mode tries to solve this issue responsibly with some caveats.

Sampling mode allows you to receive a certain percentage of requests to the beacon. Opening the beacon up can lead to a significant amount of write requests against your database if it is not throttled. Sampling mode allows you to dial in the percentage of requests that are allowed through. By default 10% of requests will be received by the beacon. This reduces the load on the database and hopefully prevents flooding.

To turn on sampling mode, you need to add a constant to your `wp-config.php` file:

```php
<?php
define( 'MCD_SAMPLE_MODE', true );
```

By default, sampling is turned off. Adding this constant will turn it on. To set the frequency of requests that are accepted, you can set another constant:

```php
<?php
define( 'MCD_SAMPLE_FREQUENCY', 10 );
```

The number set, divided by 100, is the percentage of requests that are accepted. A value of 10 is equal to 10% since 10/100 = 0.1, or 10%.

*Please use sampling mode responsibly. At no point should you leave sampling mode turned on for more than a limited period of time. This will degrade your site's performance, scalability, and security.* I recommend turning it on for a short duration (e.g., 10 minutes) and promptly disabling it. Please adjust this based on your traffic levels.

Additionally, with sampling mode turned on, it is significantly easier for an attacker to push malicious requests to your site that will lead to a write operation against your database. Sampling mode must allow mostly anonymous requests to prompt a write operation to track the CSP reports. This mode is not intended to be turned on indefinitely. You should only turn it on to capture violations, then turn it back off while working out those violations. Using the tool in this manner will greatly reduce the attack vector.
