---
layout: post.njk
title:      "HTTPS Mixed Content Detector 1.1.0 Update: WP CLI, HTTPS Status, and Specific Policies"
date:       2015-01-04 14:30:00
categories: security
permalink: /wordpress-https-mixed-content-detector-1-1-0-update/
---

After a positive response to releasing [HTTPS Mixed Content Detector](https://wordpress.org/plugins/https-mixed-content-detector), I decided to get some more work done on the project this weekend, which culminated in an solid version 1.1.0. I am really happy with the new features in this release.

### WP CLI Commands

I am a huge fan of WP CLI and always planned on eventually adding some command line magic to the plugin. I could not help myself and went ahead and added the magic to this release. In all, I added 4 commands for the release.

**`wp mcd list`**

This command lists all of the CSP violations that are currently logged on your site. I find the WP CLI tables to be a great way to quickly access information and spare me from having to log into a website and navigate around the WP dashboard. The table reveals the following information for each report:

* **ID**: The WordPress post ID for the report
* **Blocked URI**: The URI that was blocked
* **Document URI**: The URI being accessed when the report was generated
* **Referrer**: The URI that loaded the blocked URI
* **Violated Directive**: The specific directive that was violated
* **R**: Indicates whether or not a report is marked as resolved or not
* **S**: Indicates if the HTTPS variant of the blocked URI is accessible

Check out an example of the table:

![](/media/images/wp-mcd-list-example.jpg "Example of the list command")

**`wp mcd un|resolve`**

In 1.1.0, I have introduced the concept of a "resolved" and "unresolved" CSP report. A resolved report is a report that has been acknowledged and fixed by updating the URI to a non-blocked URI. An unresolved report represents a blocked URI that needs to be fixed. Via WP CLI, you can now mark a report or reports as resolved or unresolved.

To update an individual report, you would use one of the following command depending on if you want to resolve or unresolve it:

```bash
wp mcd resolve 35
wp mcd unresolve 35
```

You can also mark all reports as resolved or unresolved:

```bash
wp mcd resolve --all
wp mcd unresolve --all
```

The resolve status only appears in the `wp mcd list` table for now, but will likely be surfaced elsewhere in the dashboard at a later date.

**`wp mcd remove`**

In addition to marking a report resolved, you can remove it altogether with the remove command. Some people make like to mark a report as resolved, whereas others might want to just remove it. I can see a use case for both workflows so I have provided both commands.

To remove an individual report:

```bash
wp mcd remove 35
```

To remove all reports:

```bash
wp mcd remove --all
```

### HTTPS Status

One goal for this plugin is to be able to automatically resolve blocked URIs in content. To be able to do so, the plugin must be able to determine if an asset has a secure variant. To this end, I added HTTPS domain checking to this release. When a blocked URI is reported, the plugin will attempt to make a secure connection to the HTTPS version of the URI. If it can do so successfully, this information is logged. You can see the HTTPS status for a report in the "S" column of the `wp mcd list` command (see image above). Having this information makes it easy for a developer to quickly update content.

### Specific Content Security Policies

Version 1.0.0 shipped with a simple, yet effective policy for detecting mixed content. Version 1.1.0 has improved this policy to allow for better categorization of mixed content. By using the individual CSP [directives](http://w3c.github.io/webappsec/specs/content-security-policy/#directives) (e.g., "image-src", "script-src"), the plugin can categorize violations by type. Additionally, when adding your own policy is supported, it will be easier to track down the exact policy that is violated. Currently, nothing is done with this information, but it will help inform a better UI in the future (e.g., view all images that are prompting mixed content warnings).

I hope you enjoy the update as much as I enjoyed building it!
