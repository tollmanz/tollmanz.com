---
layout:     post
title:      "WordPress Object Cache Driven By The PECL Memcache(d) Extension"
date:       2012-07-12 18:58:00
categories: caching
slug:       wordpress-memcached-object-cache
---

It is my pleasure to release a beta version of a WordPress Memcached object cache backend (on [GitHub](https://github.com/tollmanz/wordpress-memcached-backend "WordPress Memcached Backend") now) based on the [PECL Memcached extension](http://pecl.php.net/package/memcached "PECL Memcached"). The extension differs from the original [WordPress Memcached Object Cache backend](http://wordpress.org/extend/plugins/memcached/ "Memcached Object Cache") in that it is based on the PECL Memcached extension, not the [PECL Memcache extension](http://pecl.php.net/package/memcache "PECL Memcache") (differeniated by addition or ommission of a "d"). While these two extensions share many of the same core memcached functions, the newer PECL Memcached extension, based on libmemcached, implements more advanced features, including multi set and get methods, "by key" functions, check and set methods, as well as read through cache callbacks. I have provided support for all of the PECL Memcached methods currently [documented on php.net](http://php.net/manual/en/book.memcached.php "PECL Memcached Documentation")<span class="footnote-article-number">1</span>. I have wanted to experiment with these features for some time and, in order to do so, this work needed to be completed. Additionally, I wanted to learn more about WordPress' object cache and there is no better way to learn about something than pulling it apart and putting it back together again. In this article, I will discuss the creation of this object cache, as well as the exciting features it has to offer.

### Of Borens and PHPUnit

While he played no direct role in the creation of this code, a HUGE shout out to [Ryan Boren](http://ryan.boren.me/ "Ryan Boren") is necessary. His work on the amazing WordPress Memcached Object Cache was a huge inspiration for this project. By grokking his work on that project, I was able to figure out how to best handle cache keys, implement a performance saving "run time" or "internal cache", and learn from the many lessons of implementing an in-memory key/value cache on the [biggest WordPress installation in existence](http://wordpress.com "WordPress.com") (e.g., why the cache flush method was neutered). Additionally, props to [Andrew Nacin](http://nacin.com "Andrew Nacin") and [Scott Taylor](http://scotty-t.com/ "Scott Taylor") for initial [Twitter](https://twitter.com/wonderboymusic/statuses/214955992302092290) [style](https://twitter.com/nacin/statuses/214960907661475840) [feedback](https://twitter.com/wonderboymusic/statuses/214961412974448640) on an early version of the project. These contributions, direct or otherwise, are absolutely invaluable to the project.

After initially creating the object cache, I needed a way to test the code base. I installed it locally and on my personal site, but because those are "no traffic" and low traffic endpoints, I really could not understand whether or not it was really working. The only way I could understand if the code was doing what it purported to do would be to painstakingly test each and every method. As such, I decided to learn unit testing to go through the code in a meticulous manner. Almost every [issue](https://github.com/tollmanz/wordpress-memcached-backend/commits/master "WordPress Memcached Backend Issues") and [commit](https://github.com/tollmanz/wordpress-memcached-backend/issues?page=1&state=closed "WordPress Memcached Backend Issues") on GitHub was a result of that testing. That, in and of itself, was a transformative process that taught me more about the PECL Memcached extension and my own coding habits than I could have ever imagined.

At this point, a few sites are running the object cache (including this site) and I have done some unit and performance testing on it. I have cleaned up a lot of bugs, but there are still plenty to be found. If you are interested in doing some testing on the project, I would love to hear from you. I have plans to test in a multi server environment soon, but if you have a setup you would like to test on, please let me know!

Now, let me tell you why this object is, in my humble opinion, pretty cool.

### Multi Get: Why Take One When You Can Take Many

When I started this project, I was most excited about multi get and, to a lesser extent multi set, methods. In a memcached environment, objects are accessed from memcached via a "get" operation. Each time a "get" command is issued, a request to the memcached server is made and a value is returned (assuming it is there). A single page load can initiate these round trips over and over and over. For instance, in a WordPress install with a memcached backend, using `get_post`, `get_terms`, and `get_post_meta` will all prompt trips to memcached to get objects. Assuming that these objects exist in memcached, they will be successfully returned and database queries will be avoided. With multi get, these three objects can be accessed with a single request to memcached, as opposed to issuing three individual requests. The clear advantage here is that the data can be accessed more quickly with fewer requests. Admittedly, 1 vs. 3 requests is hardly remarkable; however, scale this to hundreds or thousands of requests and this can result in major savings. 

The other "multi" function that is supported is the multi set method. Similar to multi get, it allows you to carry out multiple memcached actions with a single request instead of many. In this case, multi set can set numerous object in cache in a single request as opposed to many. Again, less round trips theoretically means faster processing of data and an overall more performant application.

### By Key Functions: Dictating Where Data is Stored

As I initially looked over the PECL Memcached documentation, I was intruiged by the different "by key" functions. For most methods that add data to cache or get data from cache, there is an equivalent "by key" method. For instance, in addition to the `add` and `get` methods, `addBykey` and `getByKey` are also available. These functions piqued my interest; however, the documentation was too vague to appreciate how exciting these fuctions really were. I only began to understand that through the unit testing process.

Each "by key" method allows you to send a "server key" argument to the function. The server key argument maps the particular object to a specific memcached server in the stack of memcached servers. For instance, if one adds three memcached servers to the cluster, adding an object to memcached by key will place that object on one of three servers that can then be identified by that key. In subsequent requests, you can access that piece of data from the **same exact server** by using the server key in the request. This is where I got confused. Initially, I assumed that you could map specific servers to specific keys. Then, for instance, the use case would be to map specific data to a specific server for certain reasons. Perhaps you wanted the data on server X versus server Y because it has better hardware or more RAM or is decoupled from other parts of your stack. My frustration grew as I could not figure out how to set this mapping. After doing some testing, I finally began to realize the brilliance of these methods.

Imagine that you have a data heavy WordPress installation that manages hockey statistics. The installation runs on a stack with 3 separate memcached instances. In a given page load, you want to load 1,000 objects of data to populate a view. Using the multi get methods, you can reduce the number of requests from 1,000 down to a single request. With the "by key" methods you can do even better. When these 1,000 object are originally stored in memcached, they are distributed across the network to one of the 3 memcached servers; however, when you use the "by key" method to save the data to memcached, it forces all 1,000 objects to be saved to the same server in the cluster. Without the "by key" method, you save the data to 3 servers meaning that in the multi get operation, the data actually has to been obtained from up to 3 different places. In other words, the data lookup may involve finding the data across 3 memcached instance. The "by key" methods, on the other hand, ensures that the data is all on one server and that all 1,000 pieces of data can be obtained in a single memcached lookup. Using the "by key" methods allows you to further optimize your memcached operations.

### Delayed Gets: Removing the Blocks

In applications that deal with large amounts of data, the rest of the application can be blocked from executing while the memcached get or multi get commands are being processed. Getting 1,000 objects related to hockey stats could stop the application for a considerable amount of time. This occurs because the get and multi get methods are blocking in nature and do not allow the rest of the application to proceed until that request is concluded and data is returned. The Memcached PECL extension has support for delayed gets, which, wait for it, removes blocking! The delayed get command returns immediately without waiting for the data to be available, allowing it to avoid blocking. Since the PECL Memcached extension supports delayed gets, I made sure to bake it into this version of the object cache.

Utilizing this method to its full potential requires you to think a little different about how to organize your application. Instead of accessing data when you need it, you are required to think ahead about getting data before you want to use it. For instance, if a request requires access to 1,000 pieces of data to display a page, the data should be accessed as early in the page load as possible. While PHP would normally wait during this request, delayed get allows PHP to proceed and continue processing. Once the application is ready to use the data, [fetch](http://www.php.net/manual/en/memcached.fetch.php "Memcached Fetch") operations allow access to the data and it can be processed. As icing on the cake, delayed get also has a by key equivalent, which allows you to access 1,000 objects in a single request from a single server all without blocking PHP processes.

### Check And Set: Check Yourself Before You Wreck Your Server

Websites that deal with hundreds of thousands to millions of page views on a daily basis can start to behave in unexpected ways for many reasons; one of which is concurrency issues. Many procedures can gracefully withstand concurrency issues. For instance, if a page cache expires and the page is requested by 10 concurrent users, writing that page 10 times will not cause the application to break, assuming that your servers can handle the temporarily increased work load. Some events, on the other hand, should occur once and only once. Take for instance an operation that sends out an email to a user list once per day. In WordPress, this would likely be managed with scheduled events. WordPress' scheduled events are susceptible to concurrency in certain environments (even though there is a locking mechanism in place). In this event, concurrent requests that fire the email event could result in multiple emails being sent to the same individuals; this is an event that must happen once and only once.

A common technique for handling these concurrency issues, is to use a "locking" technique. With a lock, you set a value to cache when the first request hits the code in question. For instance, one might set an object to cache identified with the key "lock" to "true" when the first request hits it. Subsequent requests check the value of the "lock" key. If it is "true", it will stop processing the request. The problem with concurrency is that these requests come at the same time; thus, both requests see object "lock" as not set (or false) and two requests get past before the lock is set, which causes the event to fire twice.

The PECL Memcached extension's [check and set](http://www.php.net/manual/en/memcached.cas.php "Check and Set") (CAS) procedures<span class="footnote-article-number">2</span> offers a valuable method for handling these concurrency events. The CAS method checks a "Check And Set token" (CAS token) prior to setting a value in memcached. The CAS token is obtained from the get method. The set will only be allowed if the CAS token is identical to what it was when the CAS token was initially accessed via the get method. If between the time that the CAS token was obtained and the CAS token is checked its value has changed, the check will fail and the set will not occur. This concept can be a bit difficult to understand, so let us look at how two concurrent events would be processed to demonstrate CAS methods.

*   Request A gets cache key "lock" and also returns a CAS token with value, (float) 282369.
*   Request B gets cache key "lock" and also returns a CAS token with value, (float) 282369. The CAS token for request A and B are identical because the "lock" object was not updated between the to get requests.
*   Request A attempts to set cache key "lock" to a new value via a CAS operation. The request is successful because the CAS token check passes. Moreover, it is successful because the CAS token will still be (float) 282369 as the "lock" has not been updated.
*   Request B attempts to set cache key "lock" to a new value via a CAS operation. The request fails because since this request's CAS token was set it was changed by request A's successful CAS operation.

To apply this to a race condition where you want an event to occur once and only once, the event would occur only if the CAS operation was successful (i.e., returns (bool) true). Otherwise, the event will not be allowed to transpire. 

Admittedly, this is a really nice in theory, but I have not had a chance to test how well CAS methods handle concurrency in the wild. Testing this is ridiculously difficult and I am making preparation to be able to do so in the near future. I do hope it works as advertised.

### Implications for WordPress

Out of the box, this object cache will work similarly to the original WordPress Memcached Object Cache. Really poorly conducted performance tests show similar performance between the two caching systems. All of the methods in the original WordPress Memcached Object Cache are supported and thus, all of the objects cached in WordPress Core are supported. 

I cannot imagine that I will see any major speed increases from this implementation with a basic WordPress installation unless the libmemcached library happens to offer a significant faster path to accessing memcached data than the PECL Memcache extension. The main advantage of this object cache will come from themes and plugins that are developed with these added methods in mind. 

At [10up](http://10up.com "10up LLC"), where I am a Senior Web Engineer, we are looking into ways to leverage this object cache and its powerful methods to drive WordPress implementations. We hope to use it as the main caching library for client projects in the near future.

### Conclusion

In the end, I am open to any feedback that anyone has. Please report [issues](https://github.com/tollmanz/wordpress-memcached-backend/commits/master "WordPress Memcached Backend Issues") on GitHub so they can be tracked in an organized fashion. Realize that I consider this to be beta at the moment and hope to bring it to a non-beta state with help from others. This post was merely to introduce people to the work. In future writing, I will discuss installing the object cache, as well as how to use some of the methods discussed above. 

<p class="footnote"><span class="footnote-footer-number">1</span> I only recently realized that there are additional methods in the PECL Memcached extension (e.g., touch). Once I fully understand these methods, I will be adding them to this WordPress extension.

<p class="footnote"><span class="footnote-footer-number">2</span> Sometimes the "CAS" operations in memcached are referred to as "Compare And Swap". My understanding of the memcached implementation is that it is considered to be a "Check And Set" operation because the method returns a boolean value, whereas a "Compare And Swap" method would return the cached value.