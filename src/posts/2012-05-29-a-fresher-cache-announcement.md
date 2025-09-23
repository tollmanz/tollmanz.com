---
layout: post.njk
title:      "Example Usage and Documentation for the \"A Fresher Cache\" Plugin "
date:       2012-05-29 12:24:00
categories: caching
permalink: /a-fresher-cache-announcement/
---

With the extra time this Memorial Day weekend, I was fortunate enough to finally write a plugin that I have been thinking about for a while. The plugin, released today, is called "A Fresher Cache" ([WordPress Plugin Repo](http://wordpress.org/extend/plugins/a-fresher-cache/ "A Fresher Cache on the WordPress Plugin Repo"), [GitHub](https://github.com/tollmanz/a-fresher-cache)). It provides a simple API for adding clickable "buttons" to the admin bar that initiate refreshing (i.e., regenerating or invalidating) the cache for specific cache items. The plugin comes with the ability to flush the rewrite rules and I hope to add other "Core" cache refresh items in future releases. Admittedly, this plugin is not the most intuitive. I hope to demonstrate and explain the power of this plugin by discussing some of the issues that I will be using it for in the future. Additionally, I will document the API in this article.

### A Sample Usage

Recently, I have been working on a website for my fiancee. The site will involve pulling data from the [Internet Movie Database](http://imdb.com "Internet Movie Database"), which has a ridiculously simple, albeit limited, [API](http://imdbapi.com/ "The IMDB API"). Part of the project involves iterating over a list of movies and querying the API for each movie in order to get the current movie rating and number of votes for the movie. These are factors that change regularly and I want to keep up to date data for the site. I have the cache refresh function set to update every 24 hours. The function that provides the cache refresh looks roughly like:

```php
<?php
function ohsc_get_ratings( $prime_cache = false ) {
	$movies = array(
		'The Usual Suspects',
		'Braveheart',
		'The King\s Speech'
	);

	$cache_key = 'ohsc-' . serialize( $movies );

	// Check the cache for the movies
	$ratings = get_transient( $cache_key );

	if ( false === $ratings || $prime_cache ) {
		// This function queries the API and gets the 3 movie's data
		$imdb_movies = ohsc_get_movies( $movies );

		$ratings = array();

		foreach ( $imdb_movies as $movie )
			$ratings[$movie->Title] = $movie->Rating;

		// Add the ratings to the cache
		if ( ! empty( $ratings ) )
			set_transient( $cache_key, $ratings );
		else
			set_transient( $cache_key, 'no-data' );
	}

	return $ratings;
}
```

I wrote the code so that I can use this one function to refresh the cache at any point. This function is ultimately associated with a WP Scheduled Event ([codex](http://codex.wordpress.org/Function_Reference/wp_schedule_event "Function Reference/wp schedule event")) that updates every 24 hours. Because I add the `$prime_cache` argument to the function, I can easily trigger a cache refresh by simply calling `ohsc_get_ratings( true );`.

When developing this, I sometimes wanted to be able to update the cached data on demand. Every so often, I would tweak an algorithm and wanted to see the results of the changes; however, because the cache was set, the new algorithm would not execute. Sure, this is easy enough to do by calling the function directly in the code or doing so in the awesome [Debug Bar Console](http://wordpress.org/extend/plugins/debug-bar-console/), I often thought, "It be great if I could just click a button to initiate this refresh." As a result, I created A Fresher Cache to fulfill this need.

A Fresher Cache allows me to register a button that will initiate the cache refresh by executing the function. Upon installing A Fresher Cache, the plugin adds an admin bar menu item labelled "Freshen". To attach my button to the "Freshen" menu item, I use the A Fresher Cache plugin API:

```php
<?php
function ohsc_add_get_ratings_refresh() {
	$button = array(
		'id' => 'ohsc-add-get-ratings-refresh',
		'title' => 'Movie Ratings',
		'function' => 'ohsc_get_ratings',
		'args' => array( true ),
	);
	afc_add_item( $button );
}
add_action( 'init', 'ohsc_add_get_ratings_refresh' );
```

This code registers a new item with the A Fresher Cache plugin. You may notice that this looks very similar to the `$wp_admin_bar->add_menu` function. The `afc_add_item` function takes the same arguments as the `add_menu` function, but takes four additional arguments (function, args, capability, no_href), which are discussed below.

These four arguments provide the main functionality of the plugin. The code above adds a new menu item titled "Movie Ratings", that when clicked, executes the function registered with the `function` argument. The plugin handles all of the necessary coding that allows the function to execute when the item is clicked.

After adding that code, the "Freshen" menu item receives a new child item that looks like the following image.

![](/media/images/freshen-movie-ratings-image.jpg "freshen-movie-ratings-image")

When clicking the item, the cache is refreshed and my changes are picked up.

### Documentation

##### afc_add_item

This function registers a new admin bar menu item under the "Freshen" menu item. It accepts a single array as its one argument. This array can contain the same arguments that the [`$wp_admin_bar->add_menu`](http://codex.wordpress.org/Function_Reference/add_menu "Function Reference/add menu") function takes. In addition, it takes four more arguments specific to the plugin's functionality. All of the accepted args are shown below.

*   **id**: unique id of the menu item (default: false)
*   **title**: display name of the item (default: false)
*   **parent**: id for the parent menu item; useful for declaring parent/child relationships (default: false)
*   **href**: href value for the menu item; should be left as default (default: false)
*   **group**: whether or not to group the menu item (default: false)
*   **meta**: meta information for the menu item (default: array)
*   **function**: the function to call when the item is clicked (default: false)
*   **args**: the arguments to send to the function (default: array)
*   **capability**: the required capability to show the item and run the function (default: 'edit_theme_options')
*   **no_href**: whether or not to make the menu item a link (default: false)

##### afc_remove_item

This function removes a previously registered item from the list of registered items. It takes one argument, which is the id value of the registered item to remove.

*   **id**: id of the item to remove (default: none)

##### afc_remove_default_actions

Removes all of the "Core" actions that are added by default. This is accomplished by unregistering the  function that would add the item. Note that to remove an individual default item, you can use `afc_remove_item`. The function takes no arguments.
