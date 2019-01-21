---
layout:     post
title:      "Caching in WordPress: Invalidation Schemes"
date:       2012-10-13 13:24:00
categories: caching
---

WordPress makes [interacting with an object cache](http://tollmanz.com/grokking-the-wp-object-cache/ "Grokking the WordPress Object Cache") a breeze. With minimal effort, one can set, get, and delete cached objects. The challenge is with how to implement those functions in a reasonable manner to develop a fast and powerful application. One of the more challenging aspects of writing applications is trying to find strategies to invalidate and regenerate cached objects. In this article, I will elucidate a strategy that I have found useful when handling dealing with evicting large amounts of grouped data. I will begin by describing the problem in detail before moving on to explain the solution I tend to implement.

### Setting Data to the Cache

To begin with, let us consider a scenario in which a widget displaying a site's top posts as measured by unique hits in Google Analytics is needed. Querying Google Analytics' API is a fairly expensive process and it is certainly the type of data that one would want to cache. It would then be reasonable to update the data on an interval (e.g., 1 hour). In order to begin talking about invalidating the cache, we first need to understand how the data is added to the cache.

When tasked with such problems, I usually start by writing the function that gets the data from the cache and regenerates the data if it is not in cache. The following code does just that:

```php
<?php
function zt_get_top_posts() {
	// Define the cache key
	$cache_key = 'zt-top-posts';

	// Attempt to get data from cache
	$top_posts = wp_cache_get( $cache_key );

	// If not found in cache regenerate
	if ( false === $top_posts ) {

		// Get posts from Google Analytics
		$top_posts = zt_generate_top_posts();

		// If none were found, save a dummy value so the caller knows that
		if ( false === $top_posts )
			$top_posts = 'none-found';

		// Set the result to the cache
		wp_cache_set( $cache_key, $top_posts, 3600 );
	}

	return $top_posts;
}
```

In addition to the wrapper function that gets the data from cache of regenerates the data, I usually write a function that simply generates the data to be cached. My preference is to query for the data, build the HTML, and then cache the HTML. The following function makes a query to Google Analytics API via the "zt_magic_GA_querier" function. It takes an array of arguments used to define the data retrieved from Google Analytics. This function is not shown here as it is not necessary for understanding the concepts presented in this article.

```php
<?php
function zt_generate_top_posts() {
	// These URLs will not be be returned
	$blacklisted_paths = array(
		'/',
		'about-us',
		'that-page-no-one-needed-to-see'
	);

	// URLs with these components will not be returned
	$blacklisted_components = array(
		'twitter-accounts',
		'.html'
	);

	// Collect the arguments
	$args = array(
		'number' 	=> 5,
		'start-date' 	=> '2012-10-07',
		'end-date' 	=> '2012-10-13',
		'bl_paths' 	=> $blacklisted_paths,
		'bl_components'	=> $blacklisted_components,
	);

	// Queries GA, relates to internal posts
	$top_post_objects = zt_magic_GA_querier( $args );

	// If no objects are returned, exit the function
	if ( false === $top_post_objects )
		return false;

	// Start building the HTML
	$html = '<ul>';

	// Loop through post objects and generate HTML
	foreach ( $top_post_objects as $post_object ) {
		$html .= '<li>';
		$html .= '<a href="' . esc_url( $post_object['permalink'] ) . '">';
		$html .= esc_html( $post_object['post_title'] );
		$html .= '</a>';
		$html .= '</li>';
	}

	$html .= '</ul>';

	return $html;
}
```

To regenerate this cache, you could save a new version of the data over the old version by setting data to the cache using the  "zt-top-posts" key. Alternatively, you could use the "wp_cache_delete" function to delete the object from cache, which would ultimately cause the data to regenerate the next time that "zt_get_top_posts" is called. The problem with this current code is that there is nothing that does that for us. Let us improve the get function to help us with this task.

```php
<?php
function zt_get_top_posts( $force = false ) {
	// Define our cache key
	$cache_key = 'zt-top-posts';

	// Attempt to grab data from cache
	$top_posts = wp_cache_get( $cache_key );

	// If not found in cache or forced, regenerate
	if ( false === $top_posts || true === $force ) {

		// Get posts from GA
		$top_posts = zt_generate_top_posts();

		// If none were found, save a dummy value so the caller knows that
		if ( false === $top_posts )
			$top_posts = 'none-found';

		// Set the result to the cache
		wp_cache_set( $cache_key, $top_posts, 3600 );
	}

	return $top_posts;
}

function zt_refresh_top_posts() {
	return zt_get_top_posts( true );
}
```

By adding a "$force" parameter to the "zt_get_top_posts" function, it cannot only be used as the main data getter, it can also be used as to regenerate the cache. This simple addition provides an easy way to invalidate the cache at any point. Additionally, I add a wrapper function that makes the "zt_get_top_posts" function easier to call for the purpose of cache regeneration. The "zt_refresh_top_posts" posts function calls "zt_get_top_posts" with the first parameter set to true. Having this function available makes it more parsimonious to use as a callback for WordPress hooks. For instance, if you wanted to schedule the cache to be regenerated every hour, you can do so with a scheduled event that involves this function.

```php
<?php
function zt_schedule_ga_refresh() {
	if ( ! wp_next_scheduled( 'zt-refresh-top-posts' )
		wp_schedule_event( time(), 'zt-refresh-top-posts' );

	add_action( 'zt-refresh-top-posts', 'zt_refresh_top_posts' );
}
add_action( 'init', 'zt_schedule_ga_refresh' );
```

This is a very simple process when you are only handling a single cached item. In this case, we are only dealing with the "zt-top-posts" cache object. We know the key of the item and can therefore delete it to invoke a cache refresh or save a new object with the same key. Things become considerably more complex when there is more than a single key and the keys are not necessarily known.

### Expanding the Google Analytics Example

In the "zt_generate_top_posts" function, you may have noticed that a number of arguments were sent to the "zt_magic_GA_querier" function. This function handles all of the logic necessary to query the Google Analytics API, which is a full featured, robust API that grants the developer access to troves of data through API parameters. In this example, I have the "zt_magic_GA_querier" function take an array of arguments that affect the data returned from the API. The current version of the function sets only a few parameters that represent only a small number of possible parameters that can be used in the Google Analytics API request.

I hope by this point you have realized that the current state of the "zt_generate_top_posts" leaves much to be desired. More specifically, the "zt_magic_GA_querier" arguments are hard coded into the function and thus the "zt_generate_top_posts" can only be used to get the data from Google Analytics that those parameters produce. A developer cannot use the "zt_generate_top_posts" function to access different Google Analytics data with the function.

The obvious solution is to have the "zt_generate_top_posts" function accept the same arguments array that is sent to the "zt_magic_GA_querier" function. As such, the developer can send arguments to the "zt_generate_top_posts", which are then passed on to the "zt_magic_GA_querier" function at which point various sets of Google Analytics data can be accessed. The following code snippet shows the re-written function.

```php
<?php
function zt_generate_top_posts( $args ) {
	// Queries GA, relates to internal posts
	$top_post_objects = zt_magic_GA_querier( $args );

	// If no objects are returned, exit the function
	if ( false === $top_post_objects )
		return false;

	// Start building the HTML
	$html = '<ul>';

	// Loop through post objects and generate HTML
	foreach ( $top_post_objects as $post_object ) {
		$html .= '<li>';
		$html .= '<a href="' . esc_url( $post_object['permalink'] ) . '">';
		$html .= esc_html( $post_object['post_title'] );
		$html .= '</a>';
		$html .= '</li>';
	}

	$html .= '</ul>';

	return $html;
}
```

This function is much improved in that it can now be used to get different types of Google Analytics data instead of just the prescribed, hard coded data that was previously in the function. In addition to re-writing this function, we also need to update the function that gets the data.

```php
<?php
function zt_get_top_posts( $args, $force = false ) {
	// Define our cache key
	$cache_key = 'zt-top-posts';

	// Attempt to grab data from cache
	$top_posts = wp_cache_get( $cache_key );

	// If not found in cache or forced, regenerate
	if ( false === $top_posts || true === $force ) {

		// Get posts from GA
		$top_posts = zt_generate_top_posts( $args );

		// If none were found, save a dummy value so the caller knows that
		if ( false === $top_posts )
			$top_posts = 'none-found';

		// Set the result to the cache
		wp_cache_set( $cache_key, $top_posts, 3600 );
	}

	return $top_posts;
}
```

With this re-written function, the developer is now able to get the cached version of the data if it exists, yet regenerate it if it does not exist<span class="footnote-article-number">1</span>. The astute reader will have recognized a major issue with this transition; even though parameters have been added throughout the whole call stack, the cache key for each function call is exactly the same ("zt-top-posts"). This means that if the developer calls "zt_get_top_posts" once with a set of parameters and then a second time with a new set of parameters, the first cached object will be overwritten by the second. There is no reason why each call should not generate its own cached object. The following code snippet shows this improvement.

```php
<?php
function zt_get_top_posts( $args, $force = false ) {
	// Define our cache key
	$identifier = md5( maybe_serialize( $args ) );
	$cache_key = 'top-posts-' . $identifier;

	// Define the cache group
	$cache_group = 'zt-ga-data';

	// Attempt to grab data from cache
	$top_posts = wp_cache_get( $cache_key, $cache_group );

	// If not found in cache or forced, regenerate
	if ( false === $top_posts || true === $force ) {

		// Get posts from GA
		$top_posts = zt_generate_top_posts( $args );

		// If none were found, save a dummy value so the caller knows that
		if ( false === $top_posts )
			$top_posts = 'none-found';

		// Set the result to the cache
		wp_cache_set( $cache_key, $top_posts, $cache_group, 3600 );
	}

	return $top_posts;
}
```

The only way that the function can create a unique object ID for each set of function arguments is to use those arguments when generating the cache key. As such, the function serializes the $args array and creates a reproduceable hash of the parameters using the "md5" function<span class="footnote-article-number">2</span>. In addition to creating the unique identifier, I also use the "group" parameter of the "wp_cache_*" family of functions in order to group the items. This is more or less a way of namespacing these keys and does not offer a major advantage over not adding the "group" parameter.

### Now, Invalidation is Tricky

At this point, we have a nicely flexible function that can query for and cache countless sets of Google Analytics data. While the data is now simple to get, it has become significantly more difficult to invalidate. With the Google Analytics code above, the intention is for it to show the top posts for the whole site, individual categories, tags, authors, etc. If the site has 30 categories, 500 tags, 20 authors, etc., invalidating or refreshing the cache for each individual object, is very inefficient and difficult. To invalidate each object individually, you would have to record all of the sets of parameters sent to the function (with our case example above, that is over 550 sets of arguments!).

Now, imagine the scenario where you deploy this code to production, let it run for a few hours and then you realize that the you need to make a change to the markup that you cached or your algorithm for getting the data is faulty. Sure, you could make the change and wait for each item to update itself over time (e.g., on an hourly interval that you set or perhaps just wait for it to get evicted from cache). A better scenario would be to be able quickly invalidate or refresh the cache for all objects at once. Some applications will rely on this level of precision in order for them to function properly.

Almost always, when discussing this problem with other developers, someone will ask about a mythical "wp_cache_delete_group" function. Unfortunately, such a function does not exist primarily because most object cache backends do not support a "grouping" structure when caching objects. Like a unicorn, it is a mythical creature and we have to come back to reality to find a solution that works in the real world.

### Salting With an Incrementor

The method I tend to use when faced with this problem is salting the cache key(s) with an incrementor. In this context, an incrementor is a unique key value that, when changed, invalidates cached objects. Another way of thinking about the incrementor is to consider the incrementor value to be a "version" of the cached item. By saving an object to cache with an incrementor, you are essentially saving a version of that object in cache and when you update the incrementor, the version of the object has been "incremented" to a new version.

Before applying this idea to the Google Analytics example, let us take a look at a simplified example of this pattern. The incrementor versioning can be easily understood with the following example:

```php
<?php
function get_object( $force = false ) {
	$cache_key = 'my-object-' . get_incrementor();
	$object = wp_cache_get( $cache_key );

	if ( false === $object ) {
		$object = regenerate_cached_object();
		wp_cache_set( $cache_key, $object, 3600 );
	}

	return $object;
}

function get_incrementor( $refresh = false ) {
	$incrementor_key = 'my-incrementor';
	$incrementor_value = wp_cache_get( $incrementor_key );

	if ( false === $incrementor_value || true === $refresh ) {
		$incrementor_value = time();
		wp_cache_set( $incrementor_key, $incrementor_value );
	}

	return $incrementor_value;
}
```

When the object is initially set to cache, the cache key is salted with an incrementor value. My tendency is to use the current unix time for this salt as it is a simple way to nearly guarantee a unique salt when it needs to be updated. In this case, when the object is cached, the "get_incrementor" function is executed. It looks for a cached object with the key "my-incrementor". This cached value holds the current incrementor value. For instance, it may hold a unix time value of "441032400". As such, when "get_incrementor" is called from the "get_object" function, it would lead to a final $cache_key value of "my-object-441032400". Since the "441032400" incrementor value is saved in cache, whenever "get_object" is called, it will be able to recreate the correct cache key to access the desired object.

With this pattern in place, invalidating and refreshing the cache becomes extremely simple. The cache can be invalidated by calling the "get_object" function with a first parameter of "true" (boolean). This causes "get_incrementor" to be called with a first parameter of "true" (boolean). Ultimately, "get_incrementor" will generate and return a new unix time. For instance, if it returns an updated incrementor value of "1350133200", the new $cache_key value will be "my-object-1350133200". Since the previous object was saved with the $cache_key value of "my-object-441032400", the object with key "my-object-1350133200" will not be found in the cache, causing a cache refresh to be initiated. In a sense, the "version" of the cached object has been updated from "441032400" to "1350133200".

Note that this is a contrived, simplistic example. An incrementor method should not be used to invalidate a single cached object. Handling a single object with this method overcomplicates an otherwise basic task. The real power of this method is revealed when handling groups of objects. To better understand this, let us now turn to implementing the incrementor pattern with the Google Analytics example.

### Incrementing the Google Analytics Example

To begin with, the "zt_get_top_posts" function needs to have its cache keys salted with an incrementor. Adding the incrementor salt is a simple change.

```php
<?php
function zt_get_top_posts( $args, $force = false ) {
	// Define the cache key
	$identifier = md5( maybe_serialize( $args ) );
	$cache_key = 'top-posts-' . $identifier;

	// Define the cache group
	$cache_group = 'zt-ga-data-' . zt_get_incrementor();

	// Attempt to get data from cache
	$top_posts = wp_cache_get( $cache_key, $cache_group );

	// If not found in cache or forced, regenerate
	if ( false === $top_posts || true === $force ) {

		// Get posts from GA
		$top_posts = zt_generate_top_posts( $args );

		// If none were found, save a dummy value so the caller knows that
		if ( false === $top_posts )
			$top_posts = 'none-found';

		// Set the result to the cache
		wp_cache_set( $cache_key, $top_posts, $cache_group, 3600 );
	}

	return $top_posts;
}

function zt_get_incrementor( $refresh = false ) {
	$incrementor_key = 'google-analytics';
	$incrementor_group = 'zt-incrementors';
	$incrementor_value = wp_cache_get( $incrementor_key, $incrementor_group );

	if ( false === $incrementor_value || true === $refresh ) {
		$incrementor_value = time();
		wp_cache_set( $incrementor_key, $incrementor_value, $incrementor_group );
	}

	return $incrementor_value;
}
```

In this case, instead of salting the cache key, I salt the cache group with the incrementor. There is no difference in how this affects the design pattern or the ability to invalidate the cache; rather, I salt the group for semantic reasons. Since my goal is ultimately to invalidate a whole *group* of objects, I salt the *group* so that will ultimately change the *group*, which invalidates the whole *group*.

Salting the groups will result in the following two calls to "zt_get_top_posts" generating keys that look like the following:

```php
<?php
// Key "zt-ga-data-441032400:top-posts-d5004c5c564e1dde2e62a8f4e35fcd2f"
zt_get_top_posts( array( 'number_posts' => 5, 'category' => 'canucks' ) );

// Key "zt-ga-data-441032400:top-posts-6a081e126ad9bf2fb9c60908c729562a"
zt_get_top_posts( array( 'number_posts' => 5, 'category' => 'grizzlies' ) );
```

As you can see the "zt-ga-data" group is salted with an incrementor. Now that the "441032400" incrementor value is in the object key, the group of objects can be quickly and easily invalidated just by changing the value of the incrementor. Fortunately, the "get_incrementor" function is written in such a way that making this change is a breeze. The following code will invalidate all of the Google Analytics objects.

```php
<?php
zt_get_incrementor( true );
```

This function call changes the incrementor to a new value. As such, calling the "zt_get_top_posts" functions again cause the data to be regenerated and cached anew. For instance, the function call, `zt_get_top_posts( array( 'number_posts' => 5, 'category' => 'canucks' ) )`, previously produced an object with a key of "zt-ga-data-441032400:top-posts-d5004c5c564e1dde2e62a8f4e35fcd2f". Since updating the incrementor value, the key that the function will look for in cache will be: "zt-ga-data-1350133200:top-posts-d5004c5c564e1dde2e62a8f4e35fcd2f". That key will obviously not be found and the cache will be force refreshed as the "version" of the cache group has been updated from "441032400" to "1350133200". Note that this will also cause a force refresh of all the other Google Analytics objects in the site as these objects' keys will have also changed.

The power of this method is that now, you have in your possession, a single function that can be called to refresh every single Google Analytics object in your site<span class="footnote-article-number">3</span>. This function can be executed from a callback for a scheduled event, upon clicking a link in the admin, when pinged from an external source via XML-RPC, etc.

### A Cache Only Pattern

It is important to note that if you are not careful about how you are using this design pattern, you could accidentally consume all of your cache storage space. This strategy relies on changing the key that is used to access the cached object; it never removes the previously cached versions of the objects. It leaves it in the cache's storage. If your caching backend relies on a caching technology that does not automatically handle cache evictions, you may completely fill that storage. I tend to work with memcached on large projects that need efficient caching. Memcached implements an aggressive (sometimes way too aggressive) eviction policy whereby cached objects are frequently removed from cache. You can change the keys for the cached objects and the older objects will be removed from the cache, making room for newer versions of the objects. As such, the incrementor invalidation strategy is an effective tool in a memcached environment.

If you instead were trying to implement this strategy in WordPress using the transients API without a persistent caching backend, you would be unfortunately filling the "wp_options" table with extraneous rows of data. Transients do not automatically prune themselves from the system. They are only deleted when a current transient is accessed and its expiration time is in the past.

Using this pattern with the Alternative PHP Cache (APC) as an object cache presents similar, but different problems. APC's eviction strategy is to dump the entire cache when the cache fills up. The incrementor strategy would eventually cause APC's memory to fill up. When this happens, APC would dump the entire opcode and object cache. The site would then need to beginning regenerating all of the cache objects for the site. Low traffic sites would likely handling this with little problem; however, high traffic sites (especially those with high concurrency) may come tumbling down before the cache can be restored.

The important thing to remember when trying to implement this method is that you must be aware of how your cache evicts objects. If there is not a reasonable automatic eviction policy in place, this method will appear to work; however, it runs the risk of consuming all of the space devoted to the cache, which can have dire consequences depending on the scenario.

### Conclusion

In WordPress, invalidating groups of objects is a tough enterprise. To effectively design a system to handle cache invalidations requires thorough planning before a single line of code is written. I have presented one method of invalidating groups of cached items in the present article. I want to emphasize that this is *not the only* method for invalidating groups of cached items. If you are not aware of how your cache stores and evicts items, you should not utilize this method. Doing so will likely lead to a very difficult to debug issue. So long as you are aware of the potential pitfalls of this method, it is a powerful tool for handling a tricky scenario in WordPress development.

<p class="footnote"><span class="footnote-footer-number">1</span> I am not discussing re-writing the "zt_refresh_top_posts" function because it is just not worth it at this point. There really is no reason to use that function anymore as it is just a simple wrapper for the "get_top_posts" function. Instead of relying on the "refresh_top_posts" function, the "zt_get_top_posts" function with the "$force" parameter set to boolean true should be used.</p>

<p class="footnote"><span class="footnote-footer-number">2</span> When such identifiers are needed, do not simply default to using "md5". I would encourage you to use it as a last resort. The "md5" function in PHP is not particularly expedient and thus negatively impacts performance. It is not so bad that it should not be used; however, if you can avoid using it, it is recommended that you do so. In this example, I use it because I need to convert the array into a string and I know that most object caches have a well defined key length. I often work with memcached which defaults to a 250 character key length. Using "md5" helps guarantee that length, especially given that it is an array with no limit on size that will likely grow a considerable size.</p>

<p class="footnote"><span class="footnote-footer-number">3</span> I wrote a plugin called A Fresher Cache that allows you to take a function like this and make it callable by clicking a link in the admin bar. This is a powerful UI for giving developers and clients an easy one click solution for refreshing groups of cached objects.</p>
