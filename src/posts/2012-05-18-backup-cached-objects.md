---
layout: post.njk
title:      "A Case for \"Backing Up\" Cached Objects"
date:       2012-05-18 03:42:00
categories: caching
permalink: /backup-cached-objects/
---

I recently delivered a talk on [caching for WordPress](http://tollmanz.github.com/caching-for-coders/ "Caching for Coders") at WordCamp San Diego 2012. In the talk, I discussed the notion of "failing gracefully"--making sure that your page still renders when your cache fails, which unfortunately happens more often than one would hope. One of the options that I discussed was using a "backup" copy of the cached object to re-prime the cache on a front end request. As I had little time to discuss my thoughts about this during my talk, I will expand on why I think using a backup copy of a cached object can be useful in WordPress projects.

When I work on a project that requires a complex object to be cached (e.g., needs many API calls, makes expensive database queries), I tend to write one function that gets that data either from the cache or regenerates the data. The purpose of the function is to give me an easy way to access the data from anywhere within the project without having to think about if the data is cached or not. This function typically looks like:

```php
<?php
function get_hottest_cities( $force = false ) {
	$hottest_cities = get_transient( 'zdt-hottest-cities' );
	if ( false === $hottest_cities || $force ) {
		$hottest_cities = retrieve_hottest_cities();
		if ( $hottest_cities )
			set_transient( 'zdt-hottest-cities', $hottest_cities );
	}

	return $hottest_cities;
}
```

The function checks the cache for the data. If the data object is found in the cache, it is returned, otherwise the data is regenerated, set to the cache and returned. This data can then be used elsewhere in the application. For this example, assume that the `retrieve_hottest_cities` function performs some complex call to an API endpoint that takes some time to process.

The general flow of this function works well; however, on high concurrency websites, this code can be problematic. Should the function ever be executed during a frontend view and the cache not be set, the `retrieve_hottest_cities` function would execute. With the potential for many users to iniate this function simultaneously, the server may be overwhelmed while trying to process these requests. Konstantin Kovshenin has pondered a way of [getting an expired transient](http://kovshenin.com/2012/get-an-expired-transient-in-wordpress-good-idea-or-crazy-talk/ "Get an Expired Transient in WordPress: Good Idea or Crazy Talk?") from the cache and Mark Jaquith has written the brilliant [TLC_Transient](https://github.com/markjaquith/WP-TLC-Transients "TLC Transient GitHub Repository") class to assist with offloading expensive processes from frontend to backend (or scheduled) events. While both of these approaches serve the purpose of protecting your site from flooding, they will potentially leave a user without content during a page request. In many cases (e.g., a Tweet in a sidebar, most recent comments), the site can still serve its purpose without showing this data for a few requests; however, in mission critical scenarios (e.g., complex home page grids), data must be displayed. In these scenarios, I believe that a backup copy of the cached object can meet the needs of both displaying data, as well as protecting the application from overwhelming the server.

My suggestion for adding the backup copy of the cached object is represented by the following enhancement to the `get_hottest_cities` function.

```php
<?php
function get_hottest_cities( $force = false ) {
	$hottest_cities = get_transient( 'zdt-hottest-cities' );
	if ( false === $hottest_cities || $force ) {
		if ( $force ) {
			$hottest_cities = retrieve_hottest_cities();

			if ( $hottest_cities ) {
				set_transient( 'zdt-hottest-cities', $hottest_cities );

				if ( get_option( 'zdt-hottest-cities' ) )
					update_option( 'zdt-hottest-cities', $hottest_cities );
				else
					add_option( 'zdt-hottest-cities', $hottest_cities, '', 'no' );
			}
		} else {
			$backup = get_option( 'zdt-hottest-cities', array() );
			set_transient( 'zdt-hottest-cities', $backup );
			wp_schedule_single_event( time(), 'zdt_refresh_hottest_cities' );
		}
	}

	return $hottest_cities;
}
```

To begin, the function checks if the data is stored in the transient. If it is not, it checks to see if the cache is being forced to be refreshed. I add the `$force` argument to the function in order to have a means to force a refresh of the cache. When the data is updated on a scheduled event, the `$force` argument will be set to true. If that is the case, the data is retrieved from the API using the fictious `retrieve_hottest_cities` function that does heavy processing to get the data. The resulting data is then set to a transient, as well as a WordPress option. The WordPress option version of the data serves as the backup copy of the data. Note that the function also tests to see if the option is set before setting it in order to guarantee that the option is set with the `$autoload` parameter set to "no". Because the backup copy is meant for sitting in the database until it is needed, it is set to not autoload.

If the function is unable to locate the cached data and it is called with the `$force` parameter set to false, which is the default, the function will grab the data from the backup WordPress option. That value is then used to re-prime the cache. An event is then scheduled to attempt to truly refresh the cache. While not specifically shown in the code snippet, the `zdt_refresh_hottest_cities` hook that is used for the call to [`wp_schedule_single_event`](http://codex.wordpress.org/Function_Reference/wp_schedule_single_event "Function Reference/wp schedule single event") will trigger the cached object to refresh and replace the transient. Because the data is added on a scheduled event, it is more resilient to race conditions (although not completely) and the data should be refreshed with significantly less risk to the server.

For those not familiar with the inner workings of the transient functions, transients will guarantee persistent caching of data. In the event that no specific persistent cache is installed, it will use the database. Should that be the case, you would rarely ever need the backup option. Database cached transients go missing infrequently; however, should you use a persistent caching technology (e.g., memcached, APC), which you almost have to do if you are worrying about concurrency problems, you often times experience data evictions or cache misses, both of which cause the call to [`get_transient`](http://codex.wordpress.org/Function_Reference/get_transient "Function Reference/get transient")<span class="footnote-article-number">1</span> to return false. These are the situations this solution provides a fallback for.

Ideally, the backup cache object should not be the de facto standard for caching objects in an application. There is overhead with regard to complexity of code, database storage, and maintenance that do not make it ideal for all situations. My recommendation would be to use this only in the case that you are serving mission critical data. By "mission critical", I most certainly mean that the site, or parts of the site would appear broken without this data. Should it not be mission critical, you would probably be able to do well with serving a generic "data missing" statement until the data refreshes.

I believe that using a backup copy of cached objects to re-prime the cache can have significant benefit by solving two main problems with caching data. It helps avoid heavy processing during frontend requests, which are susceptible to concurrency issues. Pulling the data from the wp_options table is significantly simpler than retrieving if using API requests and/or intensive database queries. Retrieval from the wp_options table should stand up to concurrency spikes in many situations. Additionally, the backup copy method helps provide a consistent experience for the site users in that it increases the chances that large chunks of data will not be missing in parts of the site.

I have heard some criticism of this method, but none fully articulated. The main concerns are usually the increased complexity of the code and the extra database storage. In my opinion, nearly guaranteeing the consistent user experience makes it worth the complexity and extra storage. Do not misunderstand me though--I won't be caught dead implementing such a method for adding a Tweet to a sidebar. This method is only for the most important site data that can break the site if not available.

<p class="footnote"><span class="footnote-footer-number">1</span> I should also note that if you are using memcached or APC, you are probably also not using the transients functions and instead are directly calling the wp_cache_* functions. I use the transients functions in this article to appeal to more general cases.</p>
