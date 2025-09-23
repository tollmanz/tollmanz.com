---
layout: post.njk
title:      "What to Expect When Expecting Content Security Policy Reports"
date:       2015-08-09 17:30:00
categories: content security policy, monitoring, security
permalink: /content-security-policy-report-samples/
---

[Content Security Policy (CSP)](http://www.w3.org/TR/CSP2/) allows you to dictate a policy for content restrictions on a web site that is enforced by the browser. By setting a CSP header, can control the resources that are loaded when a visitor is viewing your website. The CSP spec allows you to build very specific policies for your site that can handle all of the different types of resources that a site might load. It is a valuable tool for protecting your site visitors.

In addition to blocking resources that violate the defined CSP, the CSP spec details a mechanism for sending reports of such violations. Monitoring these violations can help you ensure that your site is never serving content that violates your wishes whether those violations are the result of producer, developer, or hacker actions.

I have been slowly working on an OSS app to express an API for storing and retrieving CSP reports. A major challenge that I have faced with this project is figuring out how to handle the wide array of reports that are sent by different browsers. Armed with an OSS account from [Browserstack](https://www.browserstack.com), I set out to collect CSP violation reports from every browser I could get my hands on in order to figure out what I should expect when receiving CSP reports. In this article, I will outline the important differences that I observed with a goal of providing enough information to be able to write a program to normalize such reports.

## Key Points

This article is going to get deep into the weeds and if you just want the high level findings, here they are:

* I captured more than 2,200 CSP reports that are broken into browser and version and include header information.
* Generally speaking, I found four repeatable variations of reports. I classify them as "Blink", "Firefox", "Webkit", and "Old Webkit" variants. There is variation within these reports; however, these four buckets generally capture the meaningful variation. Scroll down to the discussion to see samples of these reports.
* Most important variation that I observed were with the `blocked-uri` property, the potential absence of a `csp-report` property, inconsistent cookie handling, and different content types.
* The current Blink CSP implementation is nearly perfect as far as I can tell, which means Chrome and Opera are delivering excellent CSP reports. Webkit and Gecko are all over the place with different variations of reports.
* I have a useful list of tips at the end of this article if you are wanting to deliver CSP headers on your site.

# Method

To capture these reports, I wrote a series of Node scripts to build a page with CSP violations, a naive CSP report collector, and some additional scripts for post-processing the data. All of these scripts and resources can be viewed in the [Report Only Capture repository](https://github.com/tollmanz/report-only-capture). I attempted to trigger alerts on most of the directives that are allowed; however, I was unable to trigger on all of them primarily due to lack of time. My sample includes violations of the following directives:

* script-src
* style-src
* img-src
* frame-src
* child-src
* media-src
* object-src

I set the following CSP directives to trigger reports:

```bash
default-src https://localhost:8123/; child-src https://localhost:8123/; connect-src https://localhost:8123/; font-src https://localhost:8123/; img-src https://localhost:8123/; media-src https://localhost:8123/; object-src https://localhost:8123/; script-src https://localhost:8123/; style-src https://localhost:8123/; form-action https://localhost:8123/; frame-ancestors 'none'; plugin-types 'none'; report-uri http://localhost:8123/csp-report
```

This value was set for three different headers in order to capture reports for older browsers:

```bash
Content-Security-Policy
X-Content-Security-Policy
X-Webkit-CSP
```

These policies were applied to a test page that I set up that attempted to load different resources that violated the policies. The [page's HTML](https://github.com/tollmanz/report-only-capture/blob/9a52a5e6c71772953ddb7189fde5f2c61c4b3533/templates/csp.html) at the time of testing can be viewed on GitHub.

When reports were triggered, they were sent to an endpoint that retrieved the headers, POST body content, and query args (which contained the browser information) and recorded the data as a JSON object in a document database.

To collect the data, I used a combination of automated testing and manual page views. All of the tests were conducted using browsers through Browserstack's VMs. Ideally, I would collect CSP reports from every browser on every OS, but that was not practical given my resources. Instead, I focused on getting reports for as many browsers and browser version possible, without focusing on the OS that was used. I tested on different versions of OS X, Windows, Android and iOS. Most decisions in this regard were based on Browserstack features. I tended to prefer OS's that launched faster on Browserstack (OS X) and OS's that were more reliable in their automated testing environment (OS X and Windows).

Unfortunately, due to Selenium [limitations](https://code.google.com/p/selenium/issues/detail?id=7640) and an unreliable tests, I could only test a handful of browsers automatically. Most notably, Firefox running under Selenium does not issue CSP violation reports. Additionally, I had problems with some browsers triggering fatal Selenium errors at the start of the test, which limited automated testing. Finally, Browserstack's "Live" testing product features many more browsers than the "Automate" testing product. I could not automate all tests due to lack of access to the browsers needed.

Manual testing involved painstakingly firing up a new VM and navigating to the CSP report test page in the VM. To Browserstack's credit, these VMs launch incredibly fast (10 - 30 seconds in my experience). Each run would take 1-2 minutes to complete, but since this was an entirely manual process, it was a lot of work to complete a test run. Each test run required a specific URL per browser. The URL contained query args that identified the browser. This identifying information was essential so that a report could be associated with a specific browser as relying on user agent strings is notoriously difficult to parse accurately.

Reports were collected from 92 different browsers, including:

* Chrome 14.0 - 44.0
* Safari 5.1, 6.0, 6.1, 7.0, & 8.0 (OS X)
* Safari 5.1, 6.0, 7.0, 8.0, 9.0 (iOS)
* Opera 15.0 - 32.0
* Firefox 5.0 - 41.0
* Edge 0.11
* Android 4.4, 5.0

More browser versions and browsers were tested, but if they did not send a report, they were not included in the final sample because they produced no data. I did observe that some browsers (most notably IE 10 and 11) would adhere to the CSP directives, but not produce a report.

Each browser was tested twice; once with the CSP report URI using the same IP and port as the origin and a second test with the CSP report URI using the same IP and a different port than the origin. These two report URIs were used in order to observe differences between sending reports to different endpoints. This strategy was not too helpful and would have benefited from sending reports to different URLs altogether.

The test page used for generate the CSP reports set a cookie in the browser. I have previously observed differences in cookie handling ([see footnote in "WordPress HTTPS Mixed Content Detector Plugin"](https://www.tollmanz.com/wordpress-https-mixed-content-detector/)) and this is something I wanted to understand better. As such, I set a cookie to see if that data would be passed to the collector.

## Results

In total, 2,292 reports were observed. All reports were collected in a Couchbase database. A raw [JSON dump](https://raw.githubusercontent.com/tollmanz/report-only-capture/d79a3b89805611d5be3724144e1d24a403ef82b6/data/1439098258289/reports.json) of the data can be obtained on GitHub, or alternatively, can be [viewed in a tabular format](https://github.com/tollmanz/report-only-capture/tree/d79a3b89805611d5be3724144e1d24a403ef82b6/data/1439098258289) on GitHub. Note that when viewing this data, a field with `----` as its value means that the field was not set for the report. In other words, the browser did not send that field. If the value is empty (i.e., an empty string `''`), that means that the browser sent the field with the report, but the value was empty.

All browsers properly sent CSP violation reports as POST requests with a JSON payload. This POST request with a JSON payload was the only fully cross browser similarity that I observed. Most browsers, save for some older browsers, contained the `csp-report` property with individual report data as dictated by [CSP2 4.4](http://www.w3.org/TR/CSP2/#violation-reports); however, not all browsers adhered to this spec.

Content Security Report violations varied widely across the spectrum of browsers tested. In total, 14 different properties were observed in the `csp-report` object:

* blocked-uri
* document-uri
* effective-directive
* original-policy
* referrer
* status-code
* violated-directive
* source-file
* line-number
* column-number
* request
* request-headers
* script-sample

Additionally, two properties were observed outside of the `csp-report` property:

* document-url
* violated-directive

`document-url` was fulfilled the same purpose of `document-uri`, but only ever appeared outside of the `csp-report` object; thus, special care needs to be taken when handling this property.

The last four items in the list of properties are not specified by the CSP2 spec. Only one of the those four were observed in a modern browser, `script-sample`. Interestingly, I did not observe this as part of my core tests. Rather, I accidentally discovered this CSP report was triggered when using Firefox's Developer Tools to inspect elements in the DOM. This apparently triggered a script to execute and a CSP report to be sent.

The other three non-standard properties were observed in the following browsers:

* `request`, contained the full HTTP request string (e.g., `GET http://45.55.25.245:8123/csp?os=OS%20X&device=&browser_version=5.0&browser=firefox&os_version=Yosemite HTTP/1.1`); Firefox 5.0 - 13.0
* `request-headers`: contains headers sent with request separated by new lines; Firefox 5.0
* `document-url`: synonymous with `document-uri`; Safari 5.1, 6.1 (OS X), Safari 5.1, 6.0 (iOS);

The individual CSP report properties also varied depending on the browser. I will discuss properties that were implemented inconsistently across browsers. Any property not mentioned is assumed to be consistent across browsers.

**`blocked-uri`**

The `blocked-uri` directive varied primarily in the amount of information provided. The CSP2 spec [dictates](http://www.w3.org/TR/CSP2/#strip-uri-for-reporting) that this value needs to be "stripped" for reporting. It can have one of three variations:

1. `data` or `blob` or `filesystem`
2. `http://www.example.com/`
3. `http://www.example.com/resource`

If a `data`, `blob` or `filesystem` URI is the source of the violation, the spec indicates that only the word `data`, `blob` or `filesystem` should be transmitted. In no case should the resource actually be reported.

Every single version of Firefox tested (5.0 - 41.0) reported this incorrectly with regard to `data`. It reported the full data-URI encoded resource. It's worth noting that this can be particularly problematic for a CSP report collecting app as this can potentially send a significant amount of data (e.g., data-URI encoded fonts are not uncommon). All other browsers handled `data` properly. The `blob` and `filesystem` variants were not tested.

The spec further states that if the violating URI is from the same origin as the `document-uri`, the URI fragment can remain. If not, only the URI origin should be reported. Only Firefox did this incorrectly. For Firefox 5.0 - 41.0, it always reported the full URI, including the fragment, for every `blocked-uri` value. All other browsers that reported a `blocked-uri` (some older browsers didn't) correctly reported the URI with and without the fragment in the correct cases.

Interestingly, Firefox gives you more information than other browsers when reporting `blocked-uri`, but this is [highly](https://lists.w3.org/Archives/Public/public-webappsec/2014Feb/0081.html) [controversial](https://code.google.com/p/chromium/issues/detail?id=313737&thanks=313737&ts=1383237203). If you are expecting CSP reports, you are best to anticipate this overreporting and trim the extra information to conform to the CSP2 spec.

**`original-policy`**

If you look at the data collected, you will see that the `original-policy` values that were collected are highly consistent. This is indeed the case; however, I did notice and issue that I corrected relating to the use of the `'self'` keyword. When using `'self'`, browsers will treat the `original-policy` data differently. For instance, if your policy is `default-src 'self'` and your origin domain is `http://www.example.com`, the reported `original-policy` will either be `default-src 'self'` or `default-src http://www.example.com`. Some browsers translate `'self'` into the domain that `'self'` referred to at that time. This is worth noting as it can lead to confusion. For my tests, I ended up hard-coding the URI into the policy as it led to more consistent reporting and lessened some confusion I had about report inconsistencies (i.e., why is my policy different between test cases?).

**`referrer`**

Unfortunately, `referrer` was not properly tested. `referrer` contains a URL when a CSP report is triggered via an identifiable referrer. In my tests, I did not have any referrers trigger CSP reports because none the violating resources were caused by a referrer. This violation occurs when, for example, a non-violating script loads a resource that triggers a violation. The non-violating script is then passed as the referrer. I am actually only now realizing that I didn't properly evaluate this and will have to look into it another time.

**`effective-directive`**

The `effective-directive` property is unfortunately, the most underused CSP report property. The `effective-directive` gives you information on the most specific directive that was violated, even if that directive was not defined. For instance, if your CSP header is `default-src https://example.com` and an image triggers a CSP report, the `effective-directive` property will be `img-src`. Since the "effective" `img-src` directive is `img-src https://example.com`, that is what is reported. This property is helpful in categorizing violations.

This property is different than `violated-directive` in that `violated-directive` gives you the directive that was violated, not the "effective" directive. If your CSP header is `default-src https://example.com` and an image triggers a CSP report, the `violated-directive` will be `default-src https://example.com`; much less specific than the `effective-directive`.

The only browsers supporting the `effective-directive` at the time of this writing are:

* Chrome 40.0 - 44.0
* Opera 27.0 - 32.0

The lesson here is that you absolutely should not rely on `effective-directive` for categorizing your reports, as this will lead to missing data. In the discussion below, I have a tip for how you can normalize this across browsers.

**`violated-directive`**

The `violated-directive` property was very consistent across browsers with one small exception. In the same browsers that report the `document-url` ("url", not "uri") property, the `violated-directive` property is directly attached to the main body JSON object, not part of the `csp-report` object. When dealing with these reports from those browsers, you must be careful to look for the property in the correct place.

**Request Headers**

In addition to seeing variation across the JSON payload sent, the request headers showed some important cross browser variation worth discussing.

In total, 17 different request headers were observed:

* host
* user-agent
* accept
* accept-language
* accept-encoding
* content-length
* content-type
* connection
* cookie
* referer
* cache-control
* origin
* x-requested-with
* accept-charset
* pragma
* ua-cpu
* x-forwarded-for

Like with the CSP report payload, I will only discuss noteworthy differences between browsers here.

**`cookie`**

Cookie handling was wildly different between browsers. The CSP2 spec's [only comment](http://www.w3.org/TR/CSP2/#violation-reports) on the matter is (their emphasis):

>  If the origin of *report URL* is **not** the same as the origin of the protected resource, the block cookies flag MUST also be set.

I interpret this to mean that cookies should only be set if `document-uri` shares the same origin as the CSP report URI. This sharing is sensible given that resources on the same origin should be able to share cookies.

The browsers that sent a cookie during testing were:

* Chrome 14.0 - 44.0
* Edge 0.11
* Firefox 9.0 - 14.0
* Safari 5.1, 6.0, 6.1, 7.0, & 8.0 (OS X)
* Safari 5.1, 6.0, 7.0, 8.0, 9.0 (iOS)
* Opera 15.0 - 32.0

Most notably, Firefox stopped sending any cookies at version 14.0. You simply cannot get cookies out of the report in Firefox.

As for other browsers, my tests were inconclusive as to whether they were treating cookies correctly or not. I varied the report URI by port number. I incorrectly thought that cookies were scoped to port; however, I have since learned that that is an [incorrect assumption](http://stackoverflow.com/questions/1612177/are-http-cookies-port-specific/4212964#4212964).

That said, I did collect some data on reporting to different ports and can at least comment on that. Here are a few things I learned:

* As of Chrome 28.0, if the report URI does not match the URI origin and port of the `document-uri`, cookies will not be sent. They are treating separate ports essentially as separate domains.
* All versions of Opera tested (15.0 - 32.0) must have a port match to send cookies.
* Firefox (9.0 - 14.0), Safari, and Edge will send cookies regardless of the port match.

I would like to test this again with different domains to see how the behavior changes; however, given the Firefox results, I feel confident in saying that without a change to Firefox, a CSP report collector should not depend on cookies as a major browser would be completely ignored.

**`content-type`**

The CSP2 spec [states that CSP report requests](http://www.w3.org/TR/CSP2/#violation-reports) need to use a `content-type` header of `application/csp-report`. In my sample, I observed four different `content-type` headers:

* application/x-www-form-urlencoded
* application/json
* application/csp-report
* application/json; charset=UTF-8

Browsers that are sending the correct `application/csp-report` content-type include:

* Chrome 30.0 - 44.0
* Opera 17.0 - 32.0

Browsers that send the `application/json` or `application/json; charset=UTF-8` include:

* Safari 7.0, 8.0 (OS X)
* Safari 7.0, 8.0, 9.0 (iOS)
* Opera 15.0 - 16.0
* Firefox 5.0 - 41.0 (5.0 - 14.0 added `charset=UTF-8`)
* Chrome 21.0 - 29.0
* Edge 0.11

Finally, browsers that send the `application/x-www-form-urlencoded` content type are:

* Chrome 14.0 - 20.0
* Safari 5.1, 6.0, 6.1 (OS X)
* Safari 5.1, 6.0 (iOS)

Interestingly, in building a very naive collector, I had some troubles handling the `application/csp-report` content type. I used [Hapi](http://hapijs.com/) as a Node framework for building this collector, and I had to trick Hapi into thinking it was [dealing with JSON](https://www.tollmanz.com/hapi-415-unsupported-media-type/) in order for the application to properly handle the data. Content negotiation is a tricky subject so beware of the `application/csp-report` content type with your server of choice.

## Discussion

It is clear that different browsers handle CSP reports differently. On the bright side, almost all browsers that support CSP headers, will issue a CSP report (notable exception being IE 10 and 11). While not all browsers follow the CSP2 spec, with some transformations to the POSTed data, a normalized payload can be achieved. Most notably, care has to be taken to transform `blocked-uri`, alter reports without the `csp-report` property, avoid dependence on cookies, as well as properly handle the different content types sent to the collector.

From what I observed, there are essentially four categories of CSP reports:

* Blink
* Firefox
* Webkit
* Old Webkit

Each of these four categories have variation within, but you can see sample reports, including headers for each below. Please note that this should only serve as rough guidelines of the different representations. These will vary from browser to browser and version to version:

* Blink: Modern Chrome and Opera; exemplifies adherence to the CSP standard

```bash
"header": {
  "host": "45.55.25.245:8123",
  "connection": "keep-alive",
  "content-length": "869",
  "origin": "http://45.55.25.245:8123",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.65 Safari/537.36",
  "content-type": "application/csp-report",
  "accept": "*/*",
  "referer": "http://45.55.25.245:8123/csp?os=OS%20X&device=&browser_version=43.0&browser=chrome&os_version=Lion",
  "accept-encoding": "gzip, deflate",
  "accept-language": "en-US,en;q=0.8",
  "cookie": "snickerdoodle=cinnamon",
},
"body": {
  "csp-report": {
    "document-uri": "http://45.55.25.245:8123/csp?os=OS%20X&device=&browser_version=43.0&browser=chrome&os_version=Lion",
    "referrer": "",
    "violated-directive": "child-src https://45.55.25.245:8123/",
    "effective-directive": "frame-src",
    "original-policy": "default-src  https://45.55.25.245:8123/; child-src  https://45.55.25.245:8123/; connect-src  https://45.55.25.245:8123/; font-src  https://45.55.25.245:8123/; img-src  https://45.55.25.245:8123/; media-src  https://45.55.25.245:8123/; object-src  https://45.55.25.245:8123/; script-src  https://45.55.25.245:8123/; style-src  https://45.55.25.245:8123/; form-action  https://45.55.25.245:8123/; frame-ancestors 'none'; plugin-types 'none'; report-uri http://45.55.25.245:8123/csp-report?os=OS%20X&device=&browser_version=43.0&browser=chrome&os_version=Lion",
    "blocked-uri": "http://google.com",
    "status-code": 200
  }
}
```

* Firefox: Mostly seen in Firefox, but also similar to Edge's implementation

```bash
"header": {
  "host": "45.55.25.245:8123",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.10; rv:37.0) Gecko/20100101 Firefox/37.0",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.5",
  "accept-encoding": "gzip, deflate",
  "content-length": "1049",
  "content-type": "application/json",
  "connection": "close"
},
"body": {
  "csp-report": {
    "blocked-uri": "data:image/gif;base64,R0lGODlhEAAQAMQAAORHHOVSKudfOulrSOp3WOyDZu6QdvCchPGolfO0o/XBs/fNwfjZ0frl3/zy7////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAkAABAALAAAAAAQABAAAAVVICSOZGlCQAosJ6mu7fiyZeKqNKToQGDsM8hBADgUXoGAiqhSvp5QAnQKGIgUhwFUYLCVDFCrKUE1lBavAViFIDlTImbKC5Gm2hB0SlBCBMQiB0UjIQA7",
    "document-uri": "http://45.55.25.245:8123/csp?os=OS%20X&device=&browser_version=37.0&browser=firefox&os_version=Yosemite",
    "original-policy": "default-src https://45.55.25.245:8123/; connect-src https://45.55.25.245:8123/; font-src https://45.55.25.245:8123/; img-src https://45.55.25.245:8123/; media-src https://45.55.25.245:8123/; object-src https://45.55.25.245:8123/; script-src https://45.55.25.245:8123/; style-src https://45.55.25.245:8123/; form-action https://45.55.25.245:8123/; frame-ancestors 'none'; report-uri http://45.55.25.245:8123/csp-report?os=OS%20X&device=&browser_version=37.0&browser=firefox&os_version=Yosemite",
    "referrer": "",
    "violated-directive": "img-src https://45.55.25.245:8123/"
  }
}
```

* Webkit: Current Webkit implementation (e.g., Safari, per-blink Chrome). I get the sense that after Chrome forked Webkit to Blink, CSP handling stagnated in Webkit, but that is purely conjecture.

```bash
"header": {
  "host": "45.55.25.245:8123",
  "connection": "keep-alive",
  "content-length": "805",
  "origin": "null",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_5) AppleWebKit/537.11 (KHTML, like Gecko) Chrome/23.0.1271.101 Safari/537.11",
  "content-type": "application/json",
  "accept": "*/*",
  "referer": "http://45.55.25.245:8123/csp?os=OS%20X&device=&browser_version=23.0&browser=chrome&os_version=Lion",
  "accept-encoding": "gzip,deflate,sdch",
  "accept-language": "en-US,en;q=0.8",
  "accept-charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
  "cookie": "snickerdoodle=cinnamon"
},
"body": {
  "csp-report": {
    "document-uri": "http://45.55.25.245:8123/csp?os=OS%20X&device=&browser_version=23.0&browser=chrome&os_version=Lion",
    "violated-directive": "default-src https://45.55.25.245:8123/",
    "original-policy": "default-src  https://45.55.25.245:8123/; child-src  https://45.55.25.245:8123/; connect-src  https://45.55.25.245:8123/; font-src  https://45.55.25.245:8123/; img-src  https://45.55.25.245:8123/; media-src  https://45.55.25.245:8123/; object-src  https://45.55.25.245:8123/; script-src  https://45.55.25.245:8123/; style-src  https://45.55.25.245:8123/; form-action  https://45.55.25.245:8123/; frame-ancestors 'none'; plugin-types 'none'; report-uri http://45.55.25.245:8123/csp-report?os=OS%20X&device=&browser_version=23.0&browser=chrome&os_version=Lion",
    "blocked-uri": "http://google.com"
  }
}
```

* Old Webkit: primarily seen in older Webkit based browsers (e.g., pre-blink Chrome, Safari)

```bash
"header": {
  "host": "45.55.25.245:8123",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_5) AppleWebKit/534.57.7 (KHTML, like Gecko) Version/5.1.5 Safari/534.55.3",
  "content-length": "216",
  "accept": "*/*",
  "origin": "null",
  "content-type": "application/x-www-form-urlencoded",
  "referer": "http://45.55.25.245:8123/csp?os=OS%2520X&device=&browser_version=3.6&browser=firefox&os_version=Yosemite",
  "accept-language": "en-us",
  "accept-encoding": "gzip, deflate",
  "cookie": "snickerdoodle=cinnamon",
  "connection": "close"
},
"body": {
  "document-url": "http://45.55.25.245:8123/csp?os=OS%2520X&device=&browser_version=3.6&browser=firefox&os_version=Yosemite",
  "violated-directive": "object-src https://45.55.25.245:8123/"
}
```

If you are writing a CSP report collector, I would recommend starting with those variations. They are a good representation of the different reports you will see. If you need a bigger sample, feel free to check out the full raw [JSON dump](https://raw.githubusercontent.com/tollmanz/report-only-capture/d79a3b89805611d5be3724144e1d24a403ef82b6/data/1439098258289/reports.json).

**Limitations**

This project was not intended to be scientific, but I do cringe when I do things that I know make it harder to make strong claims about the data I collected. The study served the purpose of understanding CSP reports in the wild, but there are some important limitations I must mention.

Some data was collected via automated means whereas other data was collected using real browsers in a virtualized environment. They could have produced variance in the data that is not accounted for.

Browser data was not collected cross platform. A more thorough study would verify and test to see if there is variation between browsers across OS's. I would have been all in for collecting more data this way, but without being able to reliably automate the process, I just don't have the time to manually do this.

A more rigorous test of different kinds of violations would be fruitful. I actually found it hard to produce reliable violations, and in the interest of moving this project along, stopped at only triggering basic violations, roughly 10 per test. I would be interested in seeing a more thorough test of all violations.

Referrers were not properly tested. This was a mistake in my test setup that I only discovered once writing up my results. This lack of data is a huge hole in this research.

Testing report URIs across domains needs to be conducted, as well as across protocols (e.g., HTTP vs. HTTPS). More exploration of the cookie issues cross domain would be fruitful to understand if there are more specific cases in which cookies could be relied upon. Additionally, I would be interested in seeing how browsers treat HTTPS reporting locations especially with regard to potential issues with mixed content issues and TLS configuration.

## Tips

In doing this work, I learned some useful tricks and tips with regard to CSP usage and would be remiss if I did not share them.

* I found the `'self'` keyword to be tricky to use. Some reports would convert it to the URI origin when reporting it in the `original-policy` property. As you can imagine, this led to confusion as to why my policy was being changed and whether or not my headers were wrong. I found that if I used the URI origin instead of `'self'`, everything was more clear and policies were easier to validate. If you take this advice, make sure that you change the URI origin for each of your staging environments. While you gain clarity, you trade it for some convenience.
* The `effective-directive` property is immensely helpful for categorizing reports; however, only two browsers support it and they only do so in recent versions. If you want to "polyfill" this for other browsers, you can do so if you define a really specific CSP header and parse the `violated-directive` property. For instance, if your policy is `default-src https://www.example.com; img-src https://www.example.com` and an image triggers a violation, you will receive the `violated-directive` property in a reliable way across most browsers. It will be `img-src https://www.example.com`. You can then use the `img-src` bit in that string to get the "effective directive" information. Note that this only works if your policy is specific.
* While you cannot change the information that is sent in a report, you can vary the report URL per page. I used this strategy to categorize browsers. For instance, to test Chrome 44.0, I set the following CSP report URI: `http://localhost:8123/csp-report?os=OS+X&os_version=Lion&browser=Chrome&browser_version=44.0`. I can then collect the information sent in the query. This strategy can be useful for any sort of segmentation that you want, so long as you can vary headers on a page by page basis in your app. I can imagine this being used to track violations per vertical for instance.
* <strike>You should use all three CSP related headers in your deployment: `Content-Security-Policy`, `X-Content-Security-Policy`, and `X-Webkit-CSP`. Without the Webkit variant, you'll miss reports from older Safari clients. `X-Content-Security-Policy` has no bearing on reports as the only clients that use it are IE 10 and 11; however, this is still important for blocking resources in those browsers.</strike> After a [warning from Neil Matatall](https://twitter.com/ndm/status/631175644622106624), I take back this recommendation. I certainly would be ok with `X-Webkit-CSP` sending mangled reports, but the fact that it can cause a white screen in some browsers is reason enough to never use it. Sorry for the bad advice.

## Acknowledgments

I want to thank [Browserstack](https://www.browserstack.com) for giving me an OSS account to do this work. This research is part of my work on building a flexible and well engineered CSP report collecting application. Without Browserstack, there is no way I could have generated the wealth of data that I needed.

Thanks to Zach Kahn and Max Cutler for testing some browsers that weren't available to me or on Browserstack. I appreciate your help in getting moar data.
