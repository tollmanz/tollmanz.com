---
layout:     post
title:      "Towards a Partial Page Templating System in WordPress"
date:       2013-04-28 14:33:00
categories: caching edge-side-includes
---

For some time, I have been thinking through how WordPress could implement a partial page cache to compliment its page cache and object cache. I believe that it is an important part of making WordPress a successful application engine. After seeing a Twitter [thread](https://twitter.com/Rarst/status/327765953460969472 "https://twitter.com/Rarst/status/327765953460969472") started by [Rarst](http://rarst.net "http://rarst.net") and [propelled](https://twitter.com/MZAWeb/status/327766336975564800 "https://twitter.com/MZAWeb/status/327766336975564800") by [Daniel Dvorkin](http://danieldvork.in/ "http://danieldvork.in/") and a post about [fragment caching](http://markjaquith.wordpress.com/2013/04/26/fragment-caching-in-wordpress/ "http://markjaquith.wordpress.com/2013/04/26/fragment-caching-in-wordpress/") by Mark Jaquith, I feel motivated to articulate my thoughts on the matter.

### What is The Problem Being Solved?

WordPress supports a drop-in called `advanced-cache.php`. If this file exists in the `wp-content` directory, it is loaded early in a WordPress page load allowing a page to be loaded from cache or generated and cached for later use. Within this file, a developer can define all logic related to caching a page (e.g., do not cache `wp-admin` page views). As such, this drop-in defines WordPress' page cache. For an example of how this can be implemented, I recommend taking a look a [Batcache](http://plugins.svn.wordpress.org/batcache/tags/1.2/advanced-cache.php "http://plugins.svn.wordpress.org/batcache/tags/1.2/advanced-cache.php"), which is similar to what [WordPress.com](http://wordpress.com "http://wordpress.com") uses as its page caching engine<span class="footnote-article-number">1</span>.

The beauty of the `advanced-cache.php` drop-in is that it loads _really early_ in the WordPress page load meaning that a developer can serve a page from the `advanced-cache.php` drop-in after loading only a tiny bit of WordPress. By my approximation, `advanced-cache.php` is included on the 1,320th line of PHP code in WordPress<span class="footnote-article-number">2</span>. With an approximate [117,554](http://www.ohloh.net/p/wordpress "http://www.ohloh.net/p/wordpress") lines of PHP in WordPress<span class="footnote-article-number">3</span>, only 1.12% of WordPress is loaded prior to `advanced-cache.php` running. That's pretty awesome!

Presently, I am aware of WordPress page caches that only cache full page views. For most uses, a full page cache is more than sufficient. As an example, the page you are currently reading is served by the Batcache page cache. The first person that read this page caused the cache to generate and all subsequent viewers get the cached version of the page (until the cache expires). It works for this page because there is no _per user dynamic data_. The data that is generated for **User A** is the same data that _should_ display for **User B**.

The full page cache model breaks once you need to display _different data_ for **User A** than **User B**. Generally speaking, Batcache's solution for this problem is simply to allow logged in users (i.e., users who will generate data unique to themselves) to regenerate the page each time they view it in order to make sure they are seeing the correct unique data. The problem with this approach is that all of the data that is shared amongst the users is _regenerated for each user_ even though the page may only need a small portion of it generated for the individual user.

To illustrated the problem, imagine a very simple page that contains the following components:

*   Header (contains a "Hi User A" message)

*   Post Text (same for all users)

*   Sidebar (same for all users and contains complex logic for generating related posts content)

*   Footer (same for all users)

Of the four main elements on the page, only the header is unique for each user. With the Batcache page caching model, the logged in **User A** will need to generate all four elements every time she views the page, when really, she only needs to cause the _Header_ to regenerate. Logged out users have no need for the "Hi User {$name}" message and thus, a welcome message free version is generated and served to all logged out users. For our logged in users, this is a problem because we are requiring them to regenerate the _Sidebar_, which contains non-performant, yet necessary, MySQL queries<span class="footnote-article-number">4</span>.

Thus, the main problem is: If the user only needs to generate one unique element out of four, why have the user generate all four page elements? In my opinion, WordPress needs a mechanism for generating and managing partial page caches that allows for more performant handling of unique user data. The rest of this article will present ideas for how this can be achieved by building on what WordPress already provides, as well as solutions for outside the WordPress community. Furthermore, I will be building on ideas that others have presented, as well as adding to these ideas.

### Terminology

When discussing caching with other developers, I sometimes find that the conversations are limited by different understanding of certain caching related terms. In an effort to clearly communicate my ideas, I would like to define what _I_ mean by a few terms before discussing my partial page caching system.

**Object caching** is the act of storing data. In most cases, the type of data that is stored is data that is expensive to obtain (e.g., data from an HTTP request, data requiring expensive MySQL queries or PHP operations). The data can be stored in a variety of places with the general principle being that subsequent data access must be less expensive than the initial data access. In the world of WordPress, [MySQL](http://codex.wordpress.org/Transients_API "http://codex.wordpress.org/Transients_API"), [memcached](http://wordpress.org/extend/plugins/memcached/ "http://wordpress.org/extend/plugins/memcached/") and [APC](http://wordpress.org/extend/plugins/apc/ "http://wordpress.org/extend/plugins/apc/") are popular object cache choices. Custom object caches can be defined with the `object-cache.php` drop in.

**Page caching** is a type of object caching where the cached object is HTML that composes a _full_ page. Generally speaking, the page cache will use the object cache to store the HTML data. In essence, page caching is object caching a specific type of object. Typically, there is no difference in the API that stores page objects versus other objects. As an example, Batcache uses the `WP_Object_Cache` class, which defines the object cache in WordPress, to store page objects. It should also be mentioned that the page cache is _never required_ to use WordPress' object cache to store the page object. Successful page cache implementations have been developed using [Varnish](http://hmn.md/blog/2012/12/17/testing-batcache-versus-varnish/ "http://hmn.md/blog/2012/12/17/testing-batcache-versus-varnish/"), [Nginx reverse proxy](http://bostinno.streetwise.co/channels/nginx-as-a-reverse-proxy-with-wordpress/ "http://bostinno.streetwise.co/channels/nginx-as-a-reverse-proxy-with-wordpress/"), and [Redis](http://www.flynsarmy.com/2013/03/how-to-drastically-speed-up-wordpress-with-redis/ "http://www.flynsarmy.com/2013/03/how-to-drastically-speed-up-wordpress-with-redis/").

The term **Fragment caching** is typically used to define a type of object caching where the cached object is HTML that composes _part_ of a page. Theoretically, a group of cached fragments can be used to generate a full page or a full page cache. Recently, [Mark Jaquith](http://markjaquith.wordpress.com/2013/04/26/fragment-caching-in-wordpress/ "http://markjaquith.wordpress.com/2013/04/26/fragment-caching-in-wordpress/") and [Weston Ruter](https://gist.github.com/westonruter/5475349 "https://gist.github.com/westonruter/5475349") have shared their takes on a fragment cache implementation. In WordPress, there is no API or system for defining an API for fragment caching. In my opinion, this makes complete sense as the object caching API is sufficient for caching fragments and a specific API used fragment caching would only provide a convenience layer for the object caching API (I will articulate my thoughts on that later).

The term fragment caching can be very confusing. The term "fragment" seems overly general as a fragment could really be anything. It could be any object. As such, my preferred term for fragment caching as defined above is **partial page cache**. I think that term is easier to understand and makes it simpler to distinguish an _object_ from a _partial page_ object.

The most important point to remember is that all of these types of objects are just stored data. The use of the data gives them a special name and meaning.

### WordPress Fragment/Partial Page Caching Solutions

My impetus for writing this article came from a Tweet from [Rarst](https://twitter.com/Rarst/status/327765953460969472 "https://twitter.com/Rarst/status/327765953460969472") that generated a number of other Tweets. In the Tweet, he indicated that he is writing a "fragment caching plugin". I am very excited to see what comes of this; however, since it is sitting a Mercurial repo somewhere hidden from my eyes, I cannot yet evaluate it. Instead, from this initial Tweet, Jaquith and Ruter weighed in with examples of how they handle fragment caching, and Daniel Dvorkin proposed a method for fragment caching. In this section, I will discuss these implementations and the one proposal.

Jaquith wrote [an article](http://markjaquith.wordpress.com/2013/04/26/fragment-caching-in-wordpress/ "http://markjaquith.wordpress.com/2013/04/26/fragment-caching-in-wordpress/") about his fragment caching class and Weston Ruter provided a [gist](https://gist.github.com/westonruter/5475349 "https://gist.github.com/westonruter/5475349") with his fragment caching wrapper. Both of these tackle an important problem: they provide a simple solution for pulling the results of expensive routines from cache when it is available and regenerating those results when it is not. Both use output buffering which means it can wrap almost any function. As an example, this would work really well for the related posts data mentioned above. If you used either of these methods, the related posts would be served from cache if available and regenerated if not. **User B** would benefit from **User A**'s generation of the related posts.

For what Jaquith and Ruter's functions purport to do, they work quite well; however, it does not provide system for partial page caching that might allow for a shorter WordPress page load in cases where only a small amount of data is needed. Bringing back the four elements previously discussed, WordPress would still need to get the four elements, even though some of them are wrapped in the fragment caching API. To be clear, when I say "WordPress would need to get the four elements", I mean that WordPress would need to run the code in the wrappers, determine if the data is available in cache, and if not, regenerate it. A lot of code is being executed; certainly more than 1.12% of WordPress. Additionally, if **User B** revisits the page, a cached version of the page _for her_ will not be saved and the page view will once again have to generate the whole page.

Dvorkin [responded to the Tweet thread](https://twitter.com/MZAWeb/status/328489999588798464 "https://twitter.com/MZAWeb/status/328489999588798464") started by Rarst with an idea that is closer to what I will discuss below. As a sidenote, I think that what Jaquith and Ruter are talking about is _way_ different than what Dvorkin is discussing. I think all parties consider this to be "Fragment Caching" and thus they are  solving different problems. Dvorkin is solving the same problem as me and is the most relevant to my discussion<span class="footnote-article-number">5</span>.

Dvorkin's approach borrows from the idea of **Edge Side Includes** (ESI) as described on the [Varnish](https://www.varnish-cache.org/docs/3.0/tutorial/esi.html "https://www.varnish-cache.org/docs/3.0/tutorial/esi.html") website:

> _Edge Side Includes_ is a language to include _fragments_ of web pages in other web pages. Think of it as HTML include statement that works over HTTP.

ESIs, which were developed by a [number of prominent technology companies](http://en.wikipedia.org/wiki/Edge_Side_Includes "http://en.wikipedia.org/wiki/Edge_Side_Includes"), allow a developer to denote specific _fragments of a full page_ that have a different eviction policy than the whole page itself. Moreover, it allows a developer to pinpoint parts of a page that can be generated separately from the whole page. By using special tags in the HTML, the HTML can be parsed to determine which parts of the page need to be generated. As such, this approach opens the door for identifying a fragment that needs to be generated _uniquely for each logged in user_.

Dvorkin proposes that if one of these tags is present in the page's HTML, a boolean value will be saved along with the cached page. The boolean will be a flag that indicates whether or not the page needs other fragments for it to be complete. Presumably, once the page is pulled from cache, if the boolean value is true, the ESI blocks are generated. Dvorkin did not elaborate on how these get generated and this is likely the hardest part of this problem. I really look forward to hearing more about his thoughts on this as he has time to articulate them.

### What's Happening Outside of WordPress

One of the things I love about Dvorkin's approach is that is pulls from technology that has no relationship to WordPress that is already solving this problem. I think it is important to look at what our web development brethren are doing in order to solve problems that we are having in WordPress. In this section, I will survey a few methods that I have observed from other communities.

##### Symfony

Symfony employs a phenomenal [HTTP Cache](http://symfony.com/doc/master/book/http_cache.html "http://symfony.com/doc/master/book/http_cache.html") that is built with the present problem in mind<span class="footnote-article-number">6</span>. Within the caching class, objects can be declared "public" or "private". Public items are objects that can be shared amongst users, whereas private items are objects unique to an individual user.

Additionally, the class lets you identify variants of the cached resource. For instance, if one wants to keep a version of the page cache that is a template for others, it can save a version of the page that includes ESIs and a second version that is saved for the specific user. Essentially, a developer can save a version of the page _with private data_ as well as a version _without private data_.

Symfony uses ESI tags to mix public and private data (or any mixed data for the matter). How would Symfony handle the four element page discussed below? I imagine it would go something like:

1.  **User A** visits the page

2.  The Header is marked as private data and the other three elements are public

3.  The Header is replaced with an ESI tag, which points to a URL that can generate that data

4.  **User A** generates the Header section for herself, which is saved as private data and only accessible by her

5.  **User B** visits the same page and is served the cached page, which includes the three public elements

6.  **User B**'s Header element is generated via the ESI, which requests the data from the specified URL

In the end, we have three cached objects: 1) the page with ESI tags, 2) **User A**'s version of the Header, and 3) **User B**'s version of the header. What's magical about this is if **User A** visits a second page, which also contains three public elements and the private Header element, **User B** will get a 100% cached version of the page because **User A** will have generated the three public elements and **User B** would have already created the private Header cache. Win. Win. Win.

A word of caution and note here is that Symfony's cache is an HTTP cache, which is very different from an object cache. My purpose in discussing it here it to explore what ideas can be taken from the implementation and applied to WordPress.

##### Ruby on Rails

When you want to know what the cool kids are doing, look no further that Ruby on Rails. It is important to look beyond how PHP developers are solving this problem to explore how other communities are tackling it.

Interestingly, it appears that Ruby on Rails itself has no partial page caching mechanism in the core project. Fortunately, I did stumble upon how a Ruby on Rails developer is tackling this issue, which has led to some great insights.

Aaron Batalion, from LivingSocial, gave [a presentation](http://www.slideshare.net/techdude/assembling-ruby-on-rails-pages-last-with-esi "http://www.slideshare.net/techdude/assembling-ruby-on-rails-pages-last-with-esi") (with very descriptive slides!) that suggests a method to solve our problem with Ruby on Rails and ESI. Batalion's method is essentially:

1.  A page request is made

2.  The ESI server responds with the _page template_. The page template is the _cached page with ESI tags_.

3.  The ESI server makes requests to the application to get the _fragments_ needed for the _page template_

4.  The application generates the needed pieces and completes the _page template_

This method is very exciting! Why? Rails is in the same place as WordPress. The project has page caching and object caching, yet it is still able to use ESIs to its advantage in order to implement partial page templates. Symfony's approach is awesome, but it requires using an HTTP Cache in WordPress; this approach in Ruby on Rails is solving the issue with the same toolset that WordPress has!

### My Theoretical Approach

Standing on the shoulders of giants, how can we piece together what we have learned to make a Partial Page Caching System in WordPress that allows us to serve the dynamic pages that I dream of? Let's take a look.

##### Thinking in Page Templates, not Page Caches

As suggested by Dvorkin, we should borrow liberally from ESIs; however, my approach would utilize ESIs that are recognized by ESI servers in order to offload work to them as opposed to being less efficient and parse it with PHP. First, we need to generate and cache a page template. For instance, when user **User A** hits our example page, WordPress would generate a page template that looks something like this:

```html
<html>
<head>
	<title>Post Title</title>
</head>
<body>
	<header>
		<esi:include src="http://my-url.com/rest-api/get/name/user-a" max-age="0" />
	</header>
	<article>
		<h1>Post Title</h1>
		<p>Post content</p>
	</article>
	<section class="sidebar">
	</section>
	<footer>
	</footer>
</body>
</html>
```

This data would likely just be cached with the ESI server (e.g., Varnish, Squid). This page template would be stored so subsequent requests do not hit the application as this is served by the ESI server. **User A** would then require a request to generate the header. Once the full page is rendered, a version of the page for **User A** will also be cached. With **User A**'s visit, she will have created three objects that are cached:

1.  Page template for the page

2.  Header partial page template

3.  The full page that includes the page template with the supplemental partial page template

Why is this desirable? At this point, if **User A** visits the page again, she will get a 100% cached page. If she visits another page that needs the header object, he will get a page that combines two cached object without invoking the application.

How does this affect **User B**? When **User B** hits the same page, she will get the page template that was created by **User A** and fire a request to the application to generate the header for herself. This is the holy grail in that it will take advantage of the three shared/public objects, yet only generate the unique/private object, which can, in turn, be used on other pages.

##### The ESI Server

One disadvantage of this system is the reliance on the ESI server. To use the system, you will need to setup something like Varnish, Squid or Akamai.

By using an ESI server, we could utilize technology that exists already to solve the problem. Developers from all walks of life are utilizing this technology for dynamic web apps. Why shouldn't WordPress use it? By buying into an existing solution, we can stand on the shoulders of giants and reap the benefits of advancements in these technologies instead of supporting our technology hidden over in our corner of the internet.

We could indeed build a parsing engine in PHP via `advanced-cache.php`; however, I can only imagine that it would not be nearly as good or performant as one of the existing ESI server technologies. Over time, the engine could be as good (or even better) than the parsing engine in the ESI servers, but I doubt that we would ever see the same performance benefits due to having to hit our PHP application. On the other hand, by building our own parsing engine, we have full control over the templating language and can add "ESI" tags that apply very specifically to WordPress. I am not sure if that would ever be needed, but if it is, adding it would be straight-forward.

##### Time to Build

Theoretically, this idea could be implemented today by anyone who is already running an ESI server. You would just need to write ESI tags into templates, then setup endpoints that generate the partial page templates. My hope is to spend time this summer developing a prototype of this idea and write more about it as I do so.

##### Limitations

I have a hunch that invalidation will be very tough with this approach; however, ESI servers all have ways of invalidating data, so it is only a matter of writing a system to aid with invalidation. I have done enough caching to know that _invalidation will cause problems_ and I am ready to meet the challenge.

Implementing this system will be a bit harder for the average WordPress developer. That is a limitation in that it is not a "one-click" solution, which is important to consider when building WordPress things. That said, anyone who _needs to use this_, should be competent in being able to setup or learning how to setup an ESI server. It is not significantly harder than adding memcached to your server, which you likely are already using if you need this.

Overall, I do not see too many limitations that make this a _terrible idea_. I post this online so others can point the limitations out for me :)

### Conclusion

There is a lot of talk about [WordPress as an application engine](http://ma.tt/2012/08/state-of-the-word-2012/ "http://ma.tt/2012/08/state-of-the-word-2012/"). I love to develop with WordPress, but it is hard for me to consider WordPress a capable application engine until we have a realistic solution for serving high scale dynamic applications with logged in users. My ideas in this article and the ideas of those I have mentioned are essential to explore in order to build a flexible caching system for serving dynamic content. Once we can get past this hurdle, I will be ready to jump on the "WordPress as an application engine" bandwagon.

Finally, a huge shout out to [Jeremy Felt](http://jeremyfelt.com) for discussing some early versions of these ideas with me.

<p class="footnote"><span class="footnote-footer-number">1</span> Batcache was developed by [Andy Skelton](http://andyskelton.com/ "http://andyskelton.com/") at [Automattic](http://automattic.com/ "http://automattic.com/"). While they use Batcache, it has been customized for their environment.</p>

<p class="footnote"><span class="footnote-footer-number">2</span> I got this number by manually counting the lines of code in WordPress prior to `advanced-cache.php` being included.</p>

<p class="footnote"><span class="footnote-footer-number">3</span> Don't take this number as gospel. I took the total number of lines of code in WordPress (202,680) as estimated by [Ohloh](http://www.ohloh.net/p/wordpress "http://www.ohloh.net/p/wordpress") and multiplied it by 58%, the percent of PHP code in WordPress. Yes, this isn't the most accurate methodology in the world, but more precise measures wouldn't likely change my estimates, so I feel pretty good about my statements.</p>

<p class="footnote"><span class="footnote-footer-number">4</span> Note that the problem of regenerating the related posts listings can largely be mitigated by caching that particular element. The focus of this article is not on this problem; rather, I am trying to make clear that having the user regenerate shared page data is inefficient.</p>

<p class="footnote"><span class="footnote-footer-number">5</span> Rarst also might be onto the same idea as Dvorkin, but as of the time of this writing, I have no idea what he is doing.</p>

<p class="footnote"><span class="footnote-footer-number">6</span> As I only learned about this while researching this article, I think that we need to take a close look at how Symfony is implementing its cache. There are some really smart ideas in there and they can be used to significantly change the landscape of WordPress caching.</p>
