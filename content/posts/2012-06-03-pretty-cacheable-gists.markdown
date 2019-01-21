---
layout:     post
title:      "Pretty Cacheable Gists"
date:       2012-06-03 12:58:00
categories: plugins
---

My main goal when building tollmanz.com was to ensure that the content would always be pleasant to read. I really enjoy the "read later" services and modelled my theme off of those services' easy-to-read article templates. Before launching, I also knew that I would need to focus a lot of attention on making code easy to read. I believe I have accomplished this with what I call "[Pretty Cacheable Gists](https://gist.github.com/2864688 "Source code for Pretty Cacheable Gists")", which is some code I wrote to utlize Gists for code snippets that are served locally, but processed with [GitHub's](http://github.com "GitHub") wonderful [Gist](http://gist.github.com "Gist") service.

Pretty Cacheable Gists has allowed me to accomplish my goals for displaying code snippets, which are:

*   Served locally
*   Cache friendly
*   Javascript free
*   Pretty syntax highlighting
*   Easy to contribute to and comment on

Gists can easily be embedded in a post with a Gist's embed code; however, I wanted to reduce the dependence on other services for this site. Additionally, I never wanted to have a delay with the code snippet rendering while the request to the third party service was made or syntax highlighting Javascript executed. Instead, I wanted to be able to have that content stored locally and served locally, and processed for syntax highlighting only once. This is exactly what Pretty Cacheable Gists does.

### How It Works

Pretty Cacheable Gists looks for Gist links when a post is saved. If a Gist is detected, the ID for the Gist is obtained and added to a list of Gist IDs to be processed. The script only queues Gists that are not already stored locally for processing. Additionally, the function that processes that list is queued to be executed ASAP with a WordPress scheduled event. I use the method of processing on a scheduled event to avoid slowness when the updating or saving a post. 

When the WordPress scheduled event for processing Gists executes, it does a number of things. First, it pings the [Gist API](http://develop.github.com/p/gist.html "GitHub Develop") to get all of the information about the Gist. I only save pieces of information relevant to my use. Second, I ping the JSON endpoint for the processed Gist code. Interestingly, the Gist API provides you with only the raw code. The JSON endpoint give you the processed Gist, which wraps different parts of the code in `div` elements for styling. Because I want Gists with a nice syntax highlighting, this is especially important. Finally, the Gist information is saved as a new post of "cgist" post type. After this completes, the Gist is stored locally and I no longer have to depend on the Gist service for my code snippets.

Upon viewing an article, the Gist link is detected and replaced with the local copy of the Gist content. I prefer this to embedding the Gist because it can be cached in the page cache, there is 0 delay in the code snippet rendering with syntax highlighting (i.e., no Javascript execution is needed), and I "own" the content forever and always. In addition to rendering the content from the custom post type, I add another layer of caching around just the Gist content so it is even easier to access on future page loads. 

### This is not a Plugin

I contemplated releasing this code as a plugin; however, I opted to only release the code and specifically not think of it as a plugin. There are a lot of [Gist plugins for WordPress](http://wordpress.org/extend/plugins/search.php?q=gist "Gist Plugins") in the repository that I am sure satisfy a lot of people's needs. I created these cacheable Gists for my purpose and my purpose only. There are a lot of things it cannot handle (e.g., multiple files in a Gist, no styling for other languages, comments). Additionally, if I released this as a plugin, I would be compelled to save each version of the Gist, allow for updating/creating Gists from WordPress, allowing different views for the Gist, etc. Basically, I feel that I would need to do a lot more work before releasing it as a plugin and a lot of the features I do not have an interest in. As a result, I am simply making the [code available as a Gist](https://gist.github.com/2864688 "Source code for Pretty Cacheable Gists"). This way, others can have the code and I do not feel responsible for creating and maintaining a plugin. I would be very happy for someone else to pick up the code and make a plugin out of it.