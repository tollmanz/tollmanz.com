---
layout:     post
title:      "A Low Cost Performance Monitoring Setup with Boomerang, Boomcatch, and Datadog"
date:       2015-07-02 12:00:00
categories: monitoring, performance
slug:       rum-monitoring-boomerang-boomcatch-datadog
---

Real User Monitoring (RUM) is an important aspect of performance optimization. RUM allows you to track and analyze how real world users of your web properties *actually* experience your website. RUM allows you to collect the real experiences of your users, as opposed to the contrived data inherit in synthetic monitoring (e.g., [Web Page Test](http://www.webpagetest.org); it's still really important!). If you've ever used Google Analytics, you've engaged in RUM before; however, RUM for web performance is more difficult because there is no service like Google Analytics that makes setting up web performance monitoring so easy. Well...there are a number of easy-to-install, pricey SaaS offerings, but those tend to be out of reach for the web performance enthusiast that wants to get started with RUM.

In this article, I want to introduce you to components of an inexpensive system to setting up RUM for a website. I will show you how to setup a RUM system for no more than the cost of your current hosting (i.e., $0 extra cost). The set up is not for the faint of heart, but it is by far the easiest system I've put together for simple RUM. I will first discuss the components of the system, then dive into instructions for how you can set up such a system.

## Conceptualizing the Components of the System

For our performance monitoring setup to work, we need four main components. Having each of these components perform an individual task makes the focus of each component very specific; however, it comes at the cost of maintaining separate systems. Fortunately, the method I'll discuss is not terribly frustrating.

**Component 1: Client Side Data Collection with Javascript**

We are attempting to collect front-end performance data. Without controlling the client connecting to the website, we are left to depend on JS APIs to collect data on the client side. The [Navigation Timing](https://developer.mozilla.org/en-US/docs/Navigation_timing) and [Resource Timing](http://www.w3.org/TR/resource-timing/) APIs, along with the clever timing of events on the client can all provide useful data about your site's performance. The first part of our monitoring involves using these APIs and custom JS to collect the metrics we intend to track.

To this end, I use the wonderful [Boomerang](https://github.com/lognormal/boomerang) JS component for this purpose. Originally developed by Yahoo, this library is currently maintained by [SOASTA](http://www.soasta.com/), a monitoring SaaS. As far as I can tell, the script is similar to what you would deploy on your site if you used SOASTA's service. It handles the hard work of normalizing data across browsers, surfacing useful metrics, and kicking off a beacon request so the data can be recorded. Boomerang has a plugin architecture that allows you to add more data to the beacon request. Additionally, the library comes with a number of plugins that exposes data that most people will already be interested in.

This component is only concerned with *taking measurements* and does not care about data format or storage. After taking its measurements, it passes the data to the next component in the system so it can be formatted and stored. As an example, Boomerang sends a request like the following on my website:

```bash
https://www.tollmanz.com/beacon?rt.start=navigation&rt.tstart=1435547327736&
rt.bstart=1435547328225&rt.end=1435547328345&t_resp=209&t_page=400&t_done=609&
t_other=t_domloaded%7C536&r=https%3A%2F%2Fwww.tollmanz.com%2Fhttp2-nghttp2-nginx-tls%2F&
r2=https%3A%2F%2Fwww.tollmanz.com%2F&nt_red_cnt=0&nt_nav_type=1&nt_nav_st=1435547327736&
nt_red_st=0&nt_red_end=0&nt_fet_st=1435547327736&nt_dns_st=1435547327755&
nt_dns_end=1435547327766&nt_con_st=1435547327766&nt_con_end=1435547327937&
nt_req_st=1435547327937&nt_res_st=1435547327945&nt_res_end=1435547327952&
nt_domloading=1435547327978&nt_domint=1435547328272&nt_domcontloaded_st=1435547328272&
nt_domcontloaded_end=1435547328272&nt_domcomp=1435547328344&nt_load_st=1435547328344&
nt_load_end=1435547328345&nt_unload_st=1435547327955&nt_unload_end=1435547327955&
nt_ssl_st=1435547327771&nt_spdy=1&nt_cinf=h2&
nt_first_paint=1435547328.33595&u=https%3A%2F%2Fwww.tollmanz.com%2Fhttp2-nghttp2-nginx-tls%2F
&v=0.9&vis.st=visible
```

To unravel that a bit, an easier to read version of the GET vars looks like:

```bash
rt.start:navigation
rt.tstart:1435547327736
rt.bstart:1435547328225
rt.end:1435547328345
t_resp:209
t_page:400
t_done:609
t_other:t_domloaded|536
r:https://www.tollmanz.com/http2-nghttp2-nginx-tls/
r2:https://www.tollmanz.com/
nt_red_cnt:0
nt_nav_type:1
nt_nav_st:1435547327736
nt_red_st:0
nt_red_end:0
nt_fet_st:1435547327736
nt_dns_st:1435547327755
nt_dns_end:1435547327766
nt_con_st:1435547327766
nt_con_end:1435547327937
nt_req_st:1435547327937
nt_res_st:1435547327945
nt_res_end:1435547327952
nt_domloading:1435547327978
nt_domint:1435547328272
nt_domcontloaded_st:1435547328272
nt_domcontloaded_end:1435547328272
nt_domcomp:1435547328344
nt_load_st:1435547328344
nt_load_end:1435547328345
nt_unload_st:1435547327955
nt_unload_end:1435547327955
nt_ssl_st:1435547327771
nt_spdy:1
nt_cinf:h2
nt_first_paint:1435547328.33595
u:https://www.tollmanz.com/http2-nghttp2-nginx-tls/
v:0.9
vis.st:visible
```

That request can be caught and handled with the second component in the system.

**Component 2: Middleware to Format and Route Beacon Data**

After Boomerang sends a beacon request, it must be handled by a server side component. At this point, we need to implement a middleware that takes the raw data collected by the client and converts it into a data format that can be processed for storage. In this case, we want it to follow a common time-series data format that many storage engines are optimized to handle. The middleware needs to convert this data and pass it along for processing.

For this middleware, I use [Boomcatch](https://github.com/nature/boomcatch), which is a server application that was built specifically for use with Boomerang. Boomcatch is a [Node based server](http://cruft.io/posts/introducing-boomcatch/) that handles the Boomerang formatted data (get it? Boomcatch *catches* Boomerang). You could write your own middleware, but the beauty of Boomcatch is that it will process all of the core Boomerang plugin data out of the box.

As an example of how Boomcatch handles data, the following reformatted log shows how a request is manipulated into more manageable data and it is passed to our 3rd component:

```bash
# Beacon request
2015-06-28 23:31:45 INFO boomcatch: referer=https://www.tollmanz.com/http2-nghttp2-nginx-tls/
user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko)
Chrome/43.0.2357.124 Safari/537.36 address=127.0.0.1[204.28.118.135] method=GET
url=/beacon?rt.start=navigation&rt.tstart=1435548704533&rt.bstart=1435548704935&
rt.end=1435548705016&t_resp=109&t_page=374&t_done=483&t_other=t_domloaded%7C431&
r=https%3A%2F%2Fwww.tollmanz.com%2Fhttp2-nghttp2-nginx-tls%2F&r2=https%3A%2F%2Fwww.tollmanz.com%2F&
nt_red_cnt=0&nt_nav_type=1&nt_nav_st=1435548704533&nt_red_st=0&nt_red_end=0&nt_fet_st=1435548704533&
nt_dns_st=1435548704557&nt_dns_end=1435548704614&nt_con_st=1435548704614&nt_con_end=1435548704629&
nt_req_st=1435548704633&nt_res_st=1435548704642&nt_res_end=1435548704650&nt_domloading=1435548704672&
nt_domint=1435548704965&nt_domcontloaded_st=1435548704965&nt_domcontloaded_end=1435548704965&
nt_domcomp=1435548705015&nt_load_st=1435548705015&nt_load_end=1435548705016&
nt_unload_st=1435548704655&nt_unload_end=1435548704655&nt_ssl_st=1435548704618&nt_spdy=1&
nt_cinf=h2&nt_first_paint=1435548704.912755&u=https%3A%2F%2Fwww.tollmanz.com%2Fhttp2-nghttp2-nginx-tls%2F&
v=0.9&vis.st=visible

# Reformatted data
2015-06-28 23:31:45 INFO boomcatch: sending
rt.firstbyte:109|ms
rt.lastbyte:483|ms
rt.load:483|ms
navtiming.dns:57|ms
navtiming.connect:15|ms
navtiming.response:8|ms
navtiming.dom:343|ms
navtiming.load:1|ms

# Confirmation of data being sent
2015-06-28 23:31:45 INFO boomcatch: sent 163 bytes
```

Notice the formatted data. For example, one piece of data that is passed on is the TCP connection time from the Navtiming API, `navtiming.connect:15|ms`. For this request, it took 15ms to establish the TCP connection. This data is formatted using the [StatsD Metrics Export Specification](https://github.com/b/statsd_spec). This spec was initially developed by Flickr and iterated on by Etsy and others. It is a format that storage engines like [Graphite](http://graphite.wikidot.com/) are built to handle.

After formatting this beacon data, it is passed on to our 3rd component for further processing.

**Component 3: Metrics Aggregator**

The 3rd component may be one of the harder ones to understand. This component listens for data sent to it via the 2nd component and pools this data for storage by the 4th component. This component stores data in memory for a fixed amount of time (e.g., 10 seconds), and sends the aggregated data along to the 4th component for storage. For instance, if 20 unique pieces of `navtiming.connect` data are sent to this component, it will take the average, median, min, max, and 95th percentile values and pass it along to the 4th component for storage. This is a simple way to reduce the overall amount of data stored, while also limiting the data writes to only 1 per specified time period. This allows developers to maintain a high level of data precision while maintaining the scalability of the monitoring system.

The most popular component to use for data aggregation is [StatsD](https://github.com/etsy/statsd). Developed by [Etsy](http://codeascraft.etsy.com/2011/02/15/measure-anything-measure-everything/), StatsD is a Node server that aggregates data and passes it along to a storage engine via UDP (recommended) or TCP to the 4th component, a storage engine. In this article, I will actually be talking about [DogstatsD](http://docs.datadoghq.com/guides/dogstatsd/), which implements the StatsD protocol and was developed for the [Datadog](https://www.datadoghq.com/) monitoring SaaS. It works just like StatsD, but has the advantaged of being installed along with the Datadog agent and preconfigured for the Datadog storage engine.

Once StatsD or DogstatsD aggregates a metrics, it sends it along to the 4th component that stores the aggregated data.

**Component 4: Metrics Storage Engine**

We've climbed mountains to format the data. Now, its time to store the fruits of our labor. A popular application for storing metrics data is [Graphite](http://graphite.wikidot.com/). Graphite allows you to store data within a scalable architecture and expose the data through a simple graphing interface. The little bit that I've experimented with Graphite has been positive; however, it has been a downright pain to get set up.

As an alternative to installing and managing Graphite, I will be discussing the [Datadog](https://www.datadoghq.com) SaaS in this article. Datadog is a hosted monitoring solution. After installing Datadog's software on your server, it'll start sending basic server information to the SaaS for you to view in highly configurable graphs and dashboards. Its API allows you to store pretty much any information you want. Even better, the service is free if you are ok with storing data for only 24 hours.

In an effort to make this walkthrough more manageable, we'll be using Datadog as the storage engine and monitoring solution. Once the data gets to Datadog, we have nothing left to do, but view the data.

**Bringing it Together**

Before moving on to installation information, let's stop to summarize what we've discussed so far. We have a 4 step process that begins by measuring data and ends with storing it using a SaaS. The data takes the following route:

1. Measured with Boomerang JS on the client and beaconed
1. Boomcatch consumes the beacon data, prepares and sends it to DogstatsD
1. DogstatsD aggregates 10 seconds worth of data and passes it along for storage
1. Datadog stores the data for viewing within their admin panel

Note that any of these 4 components can be exchanged for alternatives and in some cases, skipped completely. What I like about these components are that each one has a distinct purpose and is built without concern for any for other components in the system.

In this article, I am presenting the tools I am using as a simple and dirt cheap way to get started with monitoring. The implementation I will discuss is not built for high traffic, high availability monitoring; rather, it focuses on a reasonably approachable and affordable solution for those without big budgets who want to begin with RUM. Most certainly, this set up can be enhanced to handle a more robust load, but this article will not discuss those details.

## Installing Boomerang

Setting up Boomerang is a convoluted process of adding JS to your website. It basically comes down to adding a script to your site, but the documentation will drive you nuts trying to figure out exactly how to put it all together. Hopefully I can help clarify some of the pain points.

For Boomerang to work, you must include the [main Boomerang script](https://github.com/lognormal/boomerang/blob/master/boomerang.js), as well as at least one [plugin](https://github.com/lognormal/boomerang/blob/master/plugins) and configure the main Boomerang object with at least the `beacon_url` option. Boomerang has 15 plugins available and you can write additional plugins as you see fit. To get started, you need to pick at least one plugin. I initially chose the [navtiming.js](https://github.com/lognormal/boomerang/blob/master/plugins/navtiming.js) and [rt.js](https://github.com/lognormal/boomerang/blob/master/plugins/rt.js) plugins, which collect metrics from the W3C Navigation Timing API and round trip time, respectively. I also chose to send the beacon requests simply to `/beacon`. I downloaded all of my chosen scripts and added the following to the footer of my site:

```html
<script src="/js/boomerang.js"></script>
<script src="/js/rt.js"></script>
<script src="/js/navtiming.js"></script>
<script>
  BOOMR.init({
    beacon_url: "/beacon"
  });
</script>
```

With this minimal setup, I could see that the measurement and beaconing was working by viewing the network tab in Chrome. It showed that a request to `/beacon` with a number of `GET` variables was indeed issued. Without having set up the `/beacon` endpoint, this request 404'ed. Viewing the request, I could see that the following data was sent:

```bash
rt.start:navigation
rt.tstart:1435637445043
rt.bstart:1435637445344
rt.end:1435637445418
t_resp:38
t_page:337
t_done:375
t_other:t_domloaded|321
r:http://127.0.0.1:4000/
nt_red_cnt:0
nt_nav_type:0
nt_nav_st:1435637445043
nt_red_st:0
nt_red_end:0
nt_fet_st:1435637445043
nt_dns_st:1435637445043
nt_dns_end:1435637445043
nt_con_st:1435637445043
nt_con_end:1435637445043
nt_req_st:1435637445069
nt_res_st:1435637445081
nt_res_end:1435637445084
nt_domloading:1435637445111
nt_domint:1435637445364
nt_domcontloaded_st:1435637445364
nt_domcontloaded_end:1435637445364
nt_domcomp:1435637445416
nt_load_st:1435637445416
nt_load_end:1435637445417
nt_unload_st:1435637445096
nt_unload_end:1435637445096
nt_spdy:0
nt_cinf:http/1
nt_first_paint:0
u:http://127.0.0.1:4000/monitoring/
v:0.9
vis.st:visible
```

Clearly things are working! I'd recommend experimenting with additional plugins at this time to see the data that it will produce. All you need to do is add the `script` tag for the plugin that you wish to try and view the resulting data to see if it fits your needs.

If you read the documentation for Boomerang, it will suggest that you use an async loading mechanism for the scripts. In my experience, I completely agree. Just adding this monitoring to my site cost me about 500ms in start render time. Given that my start render was at about 700ms, this was not acceptable. I used the recommended async loading technique as a result<span class="footnote-article-number">1</span>.

The documentation will suggest that you use an included `make` command to build a single concatenated and minified script to async load; however, in my experience, the `make` command was badly broken. It seemed to include plugins I did not want, as well as exclude ones I did want. As such, I recommend skipping the `make` command. Instead, manually add boomerang.js, desired plugins, and the call to `BOOMR.init` to a single file. Be sure to minify it after concatenating these files. Name it with a version number to make it easy to purge from caches if you ever update it.

Once you have the single file prepared, add the following code to the *header* of your site, being sure to update the path to the concatenated and minified file:

```html
<script async>
(function(d, s) {
   var js = d.createElement(s),
       sc = d.getElementsByTagName(s)[0];

   js.src="/js/boomerang-2.js";
   sc.parentNode.insertBefore(js, sc);
}(document, "script"));
</script>
```

With this async loading method in place, I was able to see a better start render and visually complete time, although, I still could not get it close to the times I saw prior to setting up the monitoring. This is something I want to improve.

## Installing Boomcatch

Now that Boomerang is sending requests to `/beacon`, we need to set up Boomcatch to receive those requests. Boomcatch interprets a request URL and converts the data into the StatsD metric format to pass along to DogstatsD. It takes the raw data passed as `GET` variables shown above and translates it in into metrics data. I like to use Boomcatch for this because it was built by the maintainers of Boomerang for the sole purpose of processing Boomerang beacon requests for StatsD. Conceptually, this is simple software; however, it's a tedious application to write and I am happy to use something that just works. Boomcatch has properly handled all of the Boomerang plugin data that I've thrown at it.

Boomcatch is highly customizable, but most importantly allows you to specify the following:

1. *Validators*: checks that will either allow a request to proceed or exit
1. *Filters*: remove unnecessary pieces of data
1. *Mappers*: converts data from one format to another
1. *Forwarders*: sends the mapped data to another service to be further processed

These four processes allow a developer to customize the data for the 3rd component's needs. Fortunately, all of the processes are automatically handled via Boomcatch when using Boomerang and its plugins. If you develop your own Boomerang plugin, you would need to write components for Boomcatch to handle that new data.

As I walk through installing Boomcatch, I will be focusing on installing on Ubuntu 14.04. Since Boomcatch is a Node application, it shouldn't be too tough to apply these instructions to other distros. Before starting, make sure you have `nodejs` and `npm` installed:

```bash
sudo apt-get install nodejs
```

To save you some headache, I ran into an issue with trying to run Boomcatch as a daemon because Node is `nodejs` on Ubuntu. I [symlinked](http://askubuntu.com/a/477587) `nodejs` to `node`:

```bash
sudo ln -s /usr/local/bin/nodejs /usr/bin/node
```

With this set, we just need to install the `boomcatch` package:

```bash
sudo npm install boomcatch -g
```

If everything went well, you should be able to see the available options with the following command:

```bash
boomcatch --help
```

Boomcatch is an HTTP(S) server with an integrated application. Most of the options available are intended to configure how the server behaves. There are many ways in which you can set up the server. What I'll show you here is my preference for the system I'm discussing, but please read through the options and configure the right setup for yourself.

The primary options I want to configure are `port` and `host`. I'm setting this up on a server that also hosts the website itself and need to make sure that I'm connecting using a different port. As such, I run Boomcatch with the following settings:

```bash
boomcatch --port 8888 --host 127.0.0.1
```

Running this command will showing logging in the terminal:

```bash
2015-07-02 12:37:34 INFO boomcatch: starting boomcatch in process 14737 with options:
{
    "port": 8888,
    "host": "127.0.0.1",
    "log": {},
    "workers": 1
}
2015-07-02 12:37:34 INFO boomcatch: worker 14739 started
2015-07-02 12:37:34 INFO boomcatch: listening for 127.0.0.1:8888/beacon
```

This will only accept connections *from the server* on port 8888. To test if Boomcatch is working, open another terminal window, SSH into the server and issue the following command:

```bash
curl 127.0.0.1/beacon:8888
{ "error": "Invalid path `/`" }
```

If you look at the Boomcatch output, you'll see:

```bash
2015-07-02 12:39:51 INFO boomcatch: referer= user-agent=curl/7.35.0 address=127.0.0.1[] method=GET url=/?test
2015-07-02 12:39:51 ERROR boomcatch: 404 Invalid path `/`
```

While we are seeing errors here, that is ok. This means that the Boomcatch server is listening to the right port and things seem to be working.

You may be wondering why I am setting up Boomcatch to only listen to requests from `127.0.0.1`. This means that requests can only come from the server itself. For my setup, I am doing this in order to simplify my HTTP/2 and TLS setup. I currently use [`Nghttpx`](/http2-nghttp2-nginx-tls/) as an HTTP/2 proxy. I want to connect to Boomcatch through Nghttpx so that these requests enjoy the HTTP/2 and TLS benefits that I get from Nghttpx. Thus, I use Nghttpx as a proxy for Boomcatch. To make things a little more difficult, I push the request through Nginx. The request goes from Nghttpx => Nginx => Boomcatch.

To facilitate this, I need to add a `location` block to Nginx:

```bash
location ~* /beacon(.*)$ {
    proxy_pass    http://127.0.0.1:8888;
}
```

I use Nginx's `location` block and `proxy_pass` directive to proxy requests to `/beacon` to `127.0.0.1:8888` where my Boomcatch server is located. I like this setup personally because I manage all TLS related concerns in once place, as opposed to configuring TLS in two places (one for Nghttpx and another for Boomcatch). Additionally, Nghttpx offers better HTTPS configuration capabilities than Boomcatch.

All that said, you can definitely use Boomcatch's options to configure your setup however you want. If you set a non-local host name and make sure the port is open, you will be able to connect to it from external locations without much trouble. In fact, if you try to scale this out, you will probably have a server dedicated to Boomcatch.

Now that we can connect to Boomcatch locally and externally with a little Nginx hackery, let's set up Boomcatch to run as a daemon. To do so, I turned to Forever, a Node package for running Node servers as daemons. First, you need to install Forever:

```bash
npm install forever
```

Also, when I run Forever, I will be logging a few different things. You need to create these logs before running the Forever command:

```bash
# Set up needed logs
sudo mkdir -p /var/log/boomcatch/
sudo touch /var/log/boomcatch/boomcatch-forever.log
sudo touch /var/log/boomcatch/boomcatch-access.log
sudo touch /var/log/boomcatch/boomcatch-error.log
```

Using the following command, Boomcatch is executed as a daemon:

```bash
sudo forever -sa \
  -l /var/log/boomcatch/boomcatch-forever.log \
  -o /var/log/boomcatch/boomcatch-access.log \
  -e /var/log/boomcatch/boomcatch-error.log \
  /usr/local/bin/boomcatch \
    --port 8888 \
    --host 127.0.0.1 \
  > /dev/null 2>&1 &
```

With Forever running Boomcatch as a daemon, the server will run until you quit it. You can detach the terminal and it will still be running. You can see if it is running by checking the running processes:

```bash
ps aux | grep boomcatch
root     15451  0.0  0.4  64948  2108 pts/0    S    13:03   0:00 sudo forever -sa -l /var/log/boomcatch/boomcatch-forever.log -o /var/log/boomcatch/boomcatch-access.log -e /var/log/boomcatch/boomcatch-error.log /usr/local/bin/boomcatch --port 8888 --host 127.0.0.1
root     15452  5.0  4.6 704448 23564 pts/0    Sl   13:03   0:00 node /usr/local/bin/forever -sa -l /var/log/boomcatch/boomcatch-forever.log -o /var/log/boomcatch/boomcatch-access.log -e /var/log/boomcatch/boomcatch-error.log /usr/local/bin/boomcatch --port 8888 --host 127.0.0.1
root     15458  1.8  2.9 669856 14888 pts/0    Sl   13:03   0:00 /usr/bin/nodejs /usr/local/bin/boomcatch --port 8888 --host 127.0.0.1
root     15460  1.8  3.0 669856 15344 pts/0    Sl   13:03   0:00 /usr/bin/nodejs /usr/local/bin/boomcatch --port 8888 --host 127.0.0.1
root     15468  0.0  0.1  11740   940 pts/2    S+   13:03   0:00 grep --color=auto boomcatch
```

Alternatively, you can `tail` the Boomcatch access log, issue test requests, and look for new logs to be generated:

```bash
tail -f /var/log/boomcatch/boomcatch-access.log

2015-07-02 13:09:07 INFO boomcatch: sent 63 bytes
2015-07-02 13:09:13 INFO boomcatch: referer=https://www.tollmanz.com/public-key-pinning-for-http/ user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.130 Safari/537.36 address=127.0.0.1[68.13.74.172] method=GET url=/beacon?rt.start=navigation&rt.tstart=1435856951942&rt.bstart=1435856952540&rt.end=1435856952790&t_resp=369&t_page=479&t_done=848&r=&nt_red_cnt=0&nt_nav_type=0&nt_nav_st=1435856951942&nt_red_st=0&nt_red_end=0&nt_fet_st=1435856952229&nt_dns_st=1435856952229&nt_dns_end=1435856952229&nt_con_st=1435856952229&nt_con_end=1435856952229&nt_req_st=1435856952230&nt_res_st=1435856952311&nt_res_end=1435856952385&nt_domloading=1435856952312&nt_domint=1435856952431&nt_domcontloaded_st=1435856952431&nt_domcontloaded_end=1435856952431&nt_domcomp=1435856952788&nt_load_st=1435856952789&nt_load_end=1435856952789&nt_unload_st=0&nt_unload_end=0&nt_spdy=1&nt_cinf=h2&nt_first_paint=1435856952.436493&u=https%3A%2F%2Fwww.tollmanz.com%2Fpublic-key-pinning-for-http%2F&v=0.9&vis.st=visible
2015-07-02 13:09:13 INFO boomcatch: sending rt.firstbyte:369|ms
rt.lastbyte:848|ms
rt.load:848|ms
navtiming.response:74|ms
navtiming.dom:476|ms

2015-07-02 13:09:13 INFO boomcatch: sent 100 bytes
```

As long as you are seeing new logs generated as you visit your site, things are working correctly. With Boomcatch installed and configured, we will now move on the final two components, which are installed and configured together.

## Installing Datadog with DogstatsD

If you made it this far, the rest is downhill from here. The last two components are DogstatsD and the Datadog agent. Recalling the general setup described above, Boomcatch passes metrics formatted data to DogstatsD, which aggregates the data and passes it along to Datadog for storage. If we were not using Datadog, this step would involve installing and configuring StatsD, then installing and configuring some storage engine for the metrics data. For a small and affordable setup, I recommend Datadog for the following reasons:

1. They have a robust free plan. Signing up for an account only requires an email address and password (i.e., no credit card required)
1. The agent that is installed tracks a lot of data out of the box and can be used for much more than the data we are tracking in this tutorial
1. It handles the storage engine setup for you, which can be a little tricky to get set up on your own
1. Not only is it a storage engine, it also provides a highly configurable graphing interface on top of this data

To install the Datadog agent, first [sign up](https://www.datadoghq.com/) for an account. It will prompt you to install the agent on your server. This involves running their installer which is boiled down to a simple bash command. *That's it!* Once the agent is installed you should be able to see data pouring into your Datadog dashboard.

Installing the agent also installed DogstatsD. When we configured Boomcatch, we did not discuss anything related to passing data on to DogstatsD. By default, Boomcatch forwards data on to port 8125. This port is the default of StatsD, as well as DogstatsD. So long as you didn't configure a different forwarding port for Boomcatch, your Boomerang data will already be pouring into DogstatsD.

While it didn't seem like we did much here, we actually did quite a bit by installing the Datadog agent. The single command installed and configured everything we needed to satisfy components 3 and 4 discussed above. Now that we are collecting data, we only have one thing left to do; visualize the data!

## Viewing Data

To complete our data tracking journey, open up "Metrics Explorer" in Datadog (Metrics > Explorer). Be sure to visit your site a few times to collect some data. Once data is in the system, go to the "Graph" box on the "Metrics Explorer" dashboard. Type in "rt" to find the data related to round trip time that Boomerang was measuring. If all is working well, you should see something like:

![](/media/images/round-trip-metrics.png "Round trip metrics reported")

If you are not seeing this data, try visiting your site some more, waiting a minute and reload the "Metrics Explorer" dashboard.

Now that the data is piping into Datadog, you can begin to experiment with different dashboards to visualize the data. I set up a front end performance dashboard to visualize the navtiming and rt data:

![](/media/images/dashboard-metrics.png "Dashboard for front end metrics")

This is not too impressive due to low traffic to my site, but still gives me insight that I need.

## Conclusion

A performance monitoring solution is not the easiest thing to set up. You typically have to chose between and expensive SaaS solutions or a difficult-to-install DIY solution. I have been trying to bridge this gap for some time and the methods presented here are the closest I've gotten to a low cost, relatively easy to set up performance monitoring solution. The cost of this setup is $0 given that I am running the server components on a server that I am already running. With this basic setup, one can begin to monitor important metrics for her app with all of the important components in place. And with active measuring, you can begin optimizing!

<p class="footnote"><span class="footnote-footer-number">1</span> If you read the Boomerang JS documentation, they recommend another async technique involving <a href="http://www.phpied.com/non-onload-blocking-async-js/">loading an iframe</a>. I tried and tried to get this method to work, but to no avail. It would simply not collect all of the metrics that Boomerang was supposed to collect when using the iframe technique.
