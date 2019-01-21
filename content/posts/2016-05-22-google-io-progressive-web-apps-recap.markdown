---
layout:     post
title:      "Google I/O: The PSA about the PDA for PWAs"
date:       2016-05-22 15:00:00
categories: progressive web apps, https, google i/o
---

To translate that title: Google loves Progressive Web Apps and had a conference to profess their love for them. Last week, I had the opportunity to attend Google I/O, the developer conference focused on all things related to developing for Google products. While there was much ado about Android, VR, and cloud products, a significant portion of the event was dedicated to discussing the web. And within the web content, there was no bigger topic than [Progressive Web Apps (PWA)](https://addyosmani.com/blog/getting-started-with-progressive-web-apps/). Google [describes PWAs](https://developers.google.com/web/progressive-web-apps/) as applications that "take advantage of new technologies to bring the best of mobile sites and native applications to users. They're reliable, fast, and engaging." 

My understanding of PWAs expanded from attending numerous sessions on the topic (or other sessions that turned into discussion of PWAs). One of my favorite characterizations of PWAs was thinking of them as an app where network connectivity is [progressive enhancement](http://alistapart.com/article/understandingprogressiveenhancement)<span class="footnote-article-number">1</span>. Just as we think of certain Javascript APIs as progressive enhancements—browsers get enhanced experiences when these APIs are available—the network provides an enhancement to the app when it is available. I really enjoyed hearing about PWAs and wanted to jot down some notes about what I heard.

### Progressive Web Apps are Fast

One of the main selling points of PWAs is performance. I’ve been trying to conceptualize PWAs’ performance aspects. They do not necessarily change anything with regard to the initial load experience. If you are optimizing for a user’s first, uncached visit to your site, PWAs do nothing to improve this experience from a technical perspective; however, I would argue that it’s the PWA philosophy of “[offline first](https://developer.chrome.com/apps/offline_apps)” development that helps with the initial delivery. From the offline first perspective, you begin to prioritize what you are loading and when, which can lead to major improvements in perceived performance. For instance, your app may load in the “chrome” first, then fill in content or other flourishes later.

PWAs get their superpowers from [service workers](http://www.html5rocks.com/en/tutorials/service-worker/introduction/). Service workers are independent Javascript applications that run in the background and have privileges to interact with your website in very specific ways. As an example, when a user loads your site for the first time, a service worker could be installed in the browser. At this time, the service worker could cache site assets and network requests. When the user navigates to another page, the request could already be cached allowing for extremely fast page loads and resiliency against bad network conditions.

Perhaps the most impressive example of a PWAs was the Washington Post’s launch of [their PWA](https://www.washingtonpost.com/pwa/). The product demo showed a Washington Post article loading as an AMP article, providing a fast page load. When the article loaded as an AMP article, it installed the service worker and cached next requests, making the subsequent page load very fast (they stated *80ms* page load times). If you have an Android device, I encourage you to try the app in Chrome. It’s a truly remarkable experience.

### Innovation is Driven by Emerging Markets

Tal Oppenheimer delivered an inspiring talk titled [Building for billions on the web](https://www.youtube.com/watch?v=E6hGubMkNfM). The basic premise was that there are many people in the world getting their first experiences with the web via underpowered devices on low-bandwidth network with limited data allowances. In these emerging markets, the offline first approach with conservative network use is crucial for a successful experience.

Tal discussed [Flipkart](http://www.flipkart.com/), an Indian e-commerce site, as an example of a site that offers engaging and usable experiences by using the offline first approach. She explained that their PWA led to increased time on site, conversion, and engagement. What struck me about her talk was the fact that this innovation is being driven by people developing for emerging markets—it’s not Silicon Valley driving this need. By solving problems for people with the biggest connectivity problems, the experience is improved for all and this is enabled by this progressive enhancement approach applied to network connectivity.

### HTTPS is not Fast—It’s the Fastest

In her talk, [Mythbusting HTTPS: Squashing security’s urban legends](https://www.youtube.com/watch?v=YMfW1bfyGSY), Emily Stark discussed the many myths of HTTPS as she expertly discredited each one.

One such myth was, “HTTPS will slow down my site”. Yes, HTTPS used to be slow. The cryptography needed to establish a secure connection, and encrypt and decrypt HTTP connections used to be slow. It needed specialized hardware to get to acceptable levels of performance; however, this can now be done on [commodity hardware](https://lists.w3.org/Archives/Public/ietf-http-wg/2012JulSep/0251.html). Establishing a secure connection used to require multiple extra roundtrips beyond the initial TCP connection, adding significant latency to the request. Now, well-tuned TLS requires only 1 additional roundtrip. Additionally, if you are using HTTP/2, you can take advantage of multiplexing TCP connections, leading to a significant reduction of latency to deliver your website.

If we take Emily’s discussion of improvements to HTTPS performance, and sprinkle in the promise of PWAs that are delivering page loads in 80ms, HTTPS is now a *necessary dependency for achieving the best performance that the web can offer*. I cannot overemphasize how important this is. We must update our way of talking about HTTPS and performance. HTTPS is not slow; it is not as fast as HTTP; HTTPS unlocks enhancements that allow you to deliver the fastest experiences on the web. HTTP is now underperforming. It is rare that you get security and performance enhancements, but this is now the case with HTTPS.

### Session Highlights

Given the way that the Google I/O schedule was structured, along with some bad logistical issues, I was able to attend only a fraction of the sessions. I wanted to share the real gems (that I’ve not already discussed). I know that I missed out on other good sessions, but these are not to be missed:

* Jake Archibald - [Instant Loading: Building offline-first Progressive Web Apps](https://www.youtube.com/watch?v=cmGr0RszHc8): Jake is a fantastic and entertaining speaker who finds the most creative ways to discuss complex topics. If you are new to PWAs, this talk is a perfect way to dip your toes into the water without being overwhelmed. His comparisons of the PWA versus the more traditional web app clearly demonstrates the value of the offline first approach. And, the trailer for Service Workers is absolutely hilarious.
* Sabine Borsay, Mike West, and Alexei Czeskis - [Who are you, really: Safer and more convenient sign-in on the web](https://www.youtube.com/watch?v=MnvUlGFb3GQ): Google spent a lot of time talking about enhancements to the web platform (i.e., new, standards based APIs that the Chrome is leading the charge on). One such enhancement is the [Credential Management API](https://w3c.github.io/webappsec-credential-management/)—an API that allows the browser to manage credentials to improve user login flows. For example, if permissions are granted when a user logs into a site, this API would allow for automatic sign in on future visits if using the same browser. I recommend watching the demos in the middle of the session.
* Malte Ubl - [How AMP achieves its speed](https://events.google.com/io2016/schedule?sid=fc621cfd-0bef-e511-a517-00155d5066d7#day3/fc621cfd-0bef-e511-a517-00155d5066d7): AMP tries to deliver webpages as fast as possible. In this session, the lead developer of the project discussed the thinking behind making AMP pages load fast. This session was deeply insightful. I’ve heard many complaints about AMP and this session contextualizes to the decisions that were made with regard to the strict AMP standards. Whether you will use AMP or not, this is a great session to review for really smart web optimizations.

There are a few sessions that I unfortunately missed that I will definitely be catching up on this week, including:

* Ilya Grigorik - [Fast and resilient web apps: Tools and techniques](https://www.youtube.com/watch?v=aqvz5Oqs238)
* Alex Russell - [AMP + Progressive Web Apps: Start fast, stay engaged](https://events.google.com/io2016/schedule?sid=ed621cfd-0bef-e511-a517-00155d5066d7#day3/ed621cfd-0bef-e511-a517-00155d5066d7)
* Addy Osmani - [Progressive Web Apps across all frameworks](https://events.google.com/io2016/schedule?sid=f7621cfd-0bef-e511-a517-00155d5066d7#day3/f7621cfd-0bef-e511-a517-00155d5066d7)

### Conclusions

As a developer working on web related problems, Google I/O provided meaningful content over a three day period. The sessions I was able to attend were really well executed. It’s rare to say this about a conference, but I did not attend a single bad session. As there were more sessions that I was not able to attend than I was able to attend, I will be combing through the videos to discover the great sessions that I missed.

<p class="footnote"><span class="footnote-footer-number">1</span> I’m not really sure who to attribute this too. It was mentioned more than once and I am not sure by who.</p>