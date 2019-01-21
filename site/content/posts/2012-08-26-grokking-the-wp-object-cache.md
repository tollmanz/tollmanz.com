---
layout:     post
title:      "Grokking the WordPress Object Cache"
date:       2012-08-26 11:30:00
categories: caching
slug:       grokking-the-wp-object-cache
---

I recently had the pleasure of giving a talk at WordCamp Chicago 2012, called Grokking the WordPress Object Cache: Getting a Handle on the WP_Object_Cache Class. Instead of linking people to my slide deck, I decided to write an article that covers the concepts presented in the talk in addition to some more information that I did not discuss. My presentation style and rather sparsely populated slides make my slides a useless learning resource. In the interest of being able to share this information with the community, I thought that I could write and circulate and article instead of slides; thus, this article was written! The present article explains general caching concepts, the default `WP_Object_Cache` class, third party object caches, and some things to be cautious about when using a persistent object cache.

### The Object Caching Concept

As a concept, object caching is not difficult to understand. Object caching can be defined as the process of saving information into an alternative data store optimized for repeated, quick access. Typically, object caching is utilized to save computationally complex objects for retrieval in an more efficient manner for subsequent access. Using WordPress as an example, a commonly cached object would be the result of a SQL query (and additional processing) that is initiated by the instantiation of a new WP_Query object. Building WP_Query objects can be computationally strenuous due to expensive database queries, so rather than querying MySQL each time the same WP_Query object is instantiated, it can be cached in the object cache to improve performance on subsequent requests. This is one of many objects that can be cached.

When the subject of object caching is broached, the term "page caching" is inevitably mentioned. In the context of web development, this term refers to the act of caching a full page object. All of the HTML necessary to render a page is cached and is retrieved on subsequent page views. The computationally complex task of generating HTML for a page is converted into an object that is easier to access on subsequent requests.

Finally, caching parts of a page, instead of an entire page, is often referred to "fragment caching". This is the process of caching smaller objects that eventually compose a page. This sets up a hierarchy of cached objects, whereby cached fragments (e.g., WP_Query objects) are used to compose other cached fragments (e.g., recent posts), which compose a page cache (e.g., wordpress.com/#!/fresh/). Depending on site traffic, architecture, and projects requirements, fragment and page caching strategies can change significantly.

### Persistence

Another important distinction in the world of caching is persistent vs. non-persistent caching. A cache is said to be persistent if cached objects are saved across requests. For instance, in a persistent caching environment, a request to get the current temperature from a weather API would allow that value to be cached for future requests in order to avoid making the API call via an HTTP request for every page view. On the other hand, a non-persistent cache only stores cached objects for the life of the current request. Once the page load is completed, the cached objects are removed from memory and the next request will not have access to the cached objects that were generated during previous requests.

### WordPress' Object Cache

By default, the WordPress object cache is implemented as a non-persistent cache. The `WP_Object_Cache` class, as defined in `wp-includes/cache.php`, does not leverage any special object caching technology to handle cached objects; rather, the cached objects are stored to an publicly accessible instance variable in the `WP_Object_Cache` class. When the `wp_cache_set` or the `wp_cache_add` functions are executed, the values sent to the function are saved as a value in the `$cache` instance variable array with a key specified in the function call. For instance, if the following code snippet is executed:

```php
<?php
wp_cache_set( 'my-key', 'test-value', 'my-group' );
```

the following will be true:

```php
<?php
$wp_object_cache->cache['my-group']['my-key'] == 'test-value';
```

To access the object, the `wp_cache_get` function is utilized. When the "my-key"/"my-group", key/value pair is sent to the `wp_cache_get` function, the function accesses the "my-key" value in the "my-group" array. In other words, it returns the `$wp_object_cache->cache['my-group']['my-key']` value.

Many developers probably already naturally implement a similar technique when programming. If you know that you will need a value twice (e.g., you will need the results of a MySQL query twice in a page load), you will save the value of a computation to a variable and access the data from that variable the second time that you need to use it. With the default WordPress object cache, that is all that is being done; so called "cached" values are just being stored in a variable to be accessed later in the code execution. One advantage of utilizing the WordPress object cache is that it provides a consistent API that simplifies data storage. WordPress core utilizes the object cache API and therefore, if your code relies on an object that has already been cached (e.g., term data), it will be retrieved from the cache on subsequent requests, instead of the from the original source.

The default WordPress object cache does make page requests more performant out of the box; however, the true power of the WordPress object cache is only realized when it is used with a persistent object cache. In order to understand how the object cache API can be overriden to utilize a persistent object cache, it is imperative to first understand how the `WP_Object_Cache` class is loaded into WordPress.

### Loading The WP_Object_Cache

In order for WordPress to make the most of its object cache, it needs to be available early in the WordPress load. The object cache is loaded via the `wp_start_object_cache` function, which is called in `wp-settings.php`. The call stack, or order of files included leading up to the initiation of the cache, is as follows:

*   index.php
*   wp-blog-header.php
*   wp-load.php
*   wp-config.php
*   wp-settings.php

The `wp_start_object_cache` first checks to see if a replacement `WP_Object_Cache` class is available. In order to replace WordPress core's object cache, a file named "object-cache.php" must be placed in the "wp-content" folder. The code in `wp_start_object_cache` checks to see if that file is available. If so, it is included via `require_once`. More importantly, by including this file, WordPress will not load the default `WP_Object_Cache` class by purposely not including the `wp-includes/cache.php` file. As such, this allows for a user defined version of the `WP_Object_Cache` class that is used in place of WordPress version of the class. Additionally, if the user version is loaded, the `$_wp_using_ext_object_cache` variable is set to true, which allows code that executes later in the request to be aware of whether the default object cache or a third party object cache is being used.

### Extending The WP_Object_Cache

Many different object caches can be implemented by replacing the default`WP_Object_Cache`class. The most popular ones in the community are the Alternative PHP Cache (APC) and Memcached. The popularity for these object caches is likely related to the fact that they have very stable WordPress implementations written by some of the best developers in the community (APC by Mark Jaquith; Memcached by Ryan Boren). Additionally, APC and Memcached both work exceptionally well for caching data.

The Alternative PHP Cache is actually an opcode cache. When PHP is executed, the code is compiled in order for the server to be able to interpret it. This process requires server resources and time. Opcode caching caches the compiled code to avoid this process each time a PHP file executes. One of the major advantages of using APC is that not only do you get an opcode cache, but it can also be used as an in-memory object cache. As a result, you can install the WordPress APC Object Cache to setup a persistent caching environment. For single server environments, APC is a fantastic object cache. The major downside to APC for object caching is that it does not scale to multiple servers as it is unable to communicate shared cache contents between servers, which is a major issue for data consistency across page requests.

Memcached is a popular option for high traffic sites utilizing multiserver environments. Memcached, as described by memcached.org, is a:

"Free & open source, high-performance, distributed memory object caching system, generic in nature, but intended for use in speeding up dynamic web applications by alleviating database load.

Memcached is an in-memory key-value store for small chunks of arbitrary data (strings, objects) from results of database calls, API calls, or page rendering."

Like APC, Memcached provides WordPress developers with a persistent object cache. Unlike APC, Memcached provides that persistence across a network of servers. This network capability is important for scaling WordPress sites and applications. It is also noteworthy to mention that WordPress.com, and some of the biggest websites in the world (Facebook, Twitter) use Memcached as their object caching solutions.

### Understanding The Object Cache Interaction

In this section of the article, I will use Memcached as the exemplar for an object cache. I have chosen to talk about this object cache implementation because I am most familiar with it and it is ubitiquitous. While most of these principles will apply to other object caches, my comments in this section should only be considered in relation to Memcached.

Storing an object in or retrieving an object from cache requires a request to a server in a network. This may be the same machine that the PHP files are executed on, or one of many servers in a network. These requests are incredibly fast. They are not slow like an HTTP request. In fact, the only reason that it makes sense to make a requests to an object cache is that it is faster and less intense than generating the data on each request. With Memcached, objects are stored in RAM, which allows for extremely quick data access.

The WordPress Memcached Object Cache will store data in two places, allowing for increased speed for multiple gets in a single page request. As previously discussed, when the core `WP_Object_Cache` class sets cache objects, it is stored in the `$cache` instance variable. This allows the object to be accessed via a subsequent get request. With the Memcached Object Cache, objects are saved to and accessed from memcached; however, during a page request, the data is also saved to a PHP variable during runtime. As such, the data access is optimized for speed. For instance, imagine that during a page a request, you need to access data for a post. Using the `get_post` function, you retrieve the post data. Fortunately, the `get_post` function automatically saves to and retrieves data from the object cache. Assuming that the data has already been cached, the initial call to `get_post` in the page request will access the data from memcached and the object will be stored in the `$cache` instance variable. If subsequent calls for the same most are issued via `get_post` during the same page request, the data will be accessed from the `$cache` variable instead of making another request to memcached. While the memcached request is very quick, accessing it from a PHP variable is faster. Thus, the WordPress Memcached Object Cache optimizes where data access. As one can see, implementing a persistent object cache can lead to significant speed improvements.

### Persistent Object Caching Best Practices

**Avoid Front End Regeneration of Cached Objects**

Even though you might cache your data, you may experience significant performance issues if you do not pay attention to when the data is cached. Remember that the idea of caching is to store data that is computationally complex to generate. If the same data is requested multiple times before the data can be add to a cache, the benefits of caching are defeated. As such, it is highly recommended that data caching is not completed during front end requests.

Imagine that some data requires 2 HTTP requests (e.g., each taking .5 seconds) and an expensive database query to generate (e.g., requires multiple joins on a large dataset). If multiple requests for this data are issued before the first request is able to cache the data, your server may not be able to handle the requests. This issue is sometimes referred to as the "stampeding herd". As an alternative, it is recommended that this data generation task is completed on a scheduled internal (i.e., a cron event) or attached to an admin event that is highly unlikely to spawn multiple events at nearly the same time.

**Plan for Cache Misses**

During WordCamp Portland 2012, I had a chance to chat with Barry Abrahamson, Systems Wrangler at Automattic. One of my favorite things he said during the conversation was, "We fail all the time, and I don't care." If I understood him correctly, he was articulating the fact that Automattic's systems (that power roughly 30 million websites via WordPress.com) are built with failure in mind. Disk failures, power outages, physical corruptions, etc. happen and they happen a lot. Barry does not lose a lot of sleep over it because the systems are built with this in mind. Similarly, when writing code that uses an object cache, the application should be built with failure in mind.

Alarmingly, memcached environments produce A LOT of cache misses. This is the generic term used for scenarios in which a cached object is unavailable when the code attempts to access it. Network failure, eviction, and expiration are just a few possible reasons why a cache miss may occur. In the event of a failure, it is important to consider how this will affect the HTML markup, how the cache will be refreshed, and how best to avoid overloading the servers while trying to get the data back. There is no one way to handle a cache miss, but, so long as you think of the consequences of a cache miss, you are already on the right path to writing better code.

**Make cache priming/invalidation easy**

Inevitably, there will be a situation in which cached data will need to be refreshed. While one may be tempted to flush the entire site cache as a way to refresh an individual cached object, this is not recommended as the servers may have a very difficult time trying to repopulate all of the cached data (could you imagine if WordPress.com dumped all of their caches?). As a result, I have learned that when writing code with caching in mind, it is always best to write a method or methods that will refresh or invalidate the cache. These methods can then be tied to a UI action that allows the user to easily update a specified cached object.

### Memcached Pecadilloes

**Memcached is persistent-ish: LRU model**

Evictions are a necessary component of memcached because it does not have an unlimited data store. In memcached, an eviction is the process of removing an object from memory. Memcached is limited to the amount of RAM that is dedicated to the memcached instance. Once the storage is full, objects must be evicted. Memcached implements a "Least Recently Used" (LRU) model for evicting cached data. The LRU model dictates how items are evicted from the object cache. Within the LRU model, memcached gives preference to data that is more frequently and most recently accessed with regard to retention. Objects that are infrequently or that have not recently been accessed are the first items to be evicted. In other words, memcached attempts to hold on to data that is more "important" than other data, with "importance" being defined by frequence and recency of access.

**Grouping is nice, but it is not a core memcached concept**

As previously indicated, the `wp_cache_*` functions take a `$group` argument. While WordPress' memcached object cache implementation allows for a "group" concept, this term is meaningless to memcached. In WordPress, the group idea essentially allows for namespacing of a particular object or set of objects. When using the group parameter, the value of the parameter is prepended to the cache key when data is set or accessed. The biggest problem that this has caused for me is leading me to think that if I could store "groups" of objects, I could probably invalidate "groups" of objects. Unfortunately, memcached does not offer a way to delete a group of cached objects, simply because it does not group objects based on the group parameter. As an example, imagine that you write a function to cache different instances of a navigation menu. You must cache all variants of the menu because the active state of menus can change from page to page. If you add a new menu item, all previous cached menus need to be invalidated. When I was first presented with such a challenge, I thought that I could save each version of the menu to a "menu" group, then invalidate the "menu" group when I updated the menu. This is not possible and another approach needs to be taken to invalidate an entire group<span class="footnote-article-number">1</span>.

### A Note About Transients

WordPress Transients are popularly used for caching data in WordPress. Without using a persistent object cache, transients are stored in the "wp_options" table. The advantage of using transients is that they theoretically provide a persistent caching mechanism across many server environments. If a user does not have a persistent object cache installed, transient data is stored in the database and that data is persistent across requests. If the user is using a persistent object cache, the transient functions will use the `WP_Object_Cache` class to provide a persistent caching experience. My recommendation is that if you are writing code that will be used in numerous different server environments, transients are ideal and they nearly guarantee persistence of cached data. If you are writing code for a specific server that you know implements a persistent object cache, you should use the `wp_cache_*` functions directly in order to reduce the overhead of extra function calls.

### Final Words

If you have any aspirations of working on WordPress implementations at scale, you will need to become intimately familiar with the `WP_Object_Cache` class. Unfortunately, there is not a lot of information out there about the challenges that such developers face. With my work at 10up, I face these challenges on a daily basis. I aim to communicate more of these issues back to the community as I am inspired and have time. I would also like to ask any of you who are facing these challenges to similarly talk about your experiences.

<p class="footnote"><span class="footnote-footer-number">1</span>Erick Hitter discusses one such option using an "incrementor" value in his [Caching, Scaling, and What I've Learned from WordPress.com VIP](http://www.slideshare.net/ethitter/caching-scaling-and-what-ive-learned-from-wordpresscom-vip "Caching, Scaling, and What I") slide deck. I also intend to write more about this soon.</p>
