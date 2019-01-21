---
layout:     post
title:      "Errata and Clarifications for My WordCamp Seattle 2012 Talk"
date:       2012-05-21 03:56:00
categories: talks errata
---

You try to get all the details right, but sometimes you miss something. I suppose when you do a WordPress talk and you have Alex Mills in the front row, issues are bound to be revealed. In addition to having updated my [live slides](http://tollmanz.com/wcsea "WC SEA 2012 Slides"), below is a list of clarifications and fixes for my bold faced lies during my WordCamp Seattle 2012 talk, "There's a Function for That: Doing More for Less with Core Functions".

### current_action

[Rarst](http://www.rarst.net/ "Cynical Thoughts on Software and Web") pointed out that while there is a `current_action` function, it is not a proper analogue to `current_filter`. While there are functions named `current_action` in Core, they are methods of the `WP_List_Table` class and its derivatives that serve a different purpose than `current_filter`. I actually hastily looked for `current_action` when prepping my slides and did not look at the function definition closely enough to realize that it is quite different than `current_filter`.

### Multidimensional Arrays and wp_localize_script

Another mistruth I told during my talk was regarding `wp_localize_script`'s ability to handle multidimensional arrays. [Alex Mills](http://www.viper007bond.com/ "Random stuff written by Alex Mills") tried to correct me during the talk and I stubbornly suggested that he was wrong even after [Brandon Dove](http://brandondove.com/ "Brandon Dove") also backed Alex. Well, the egg is on my face as `wp_localize_script` does indeed support multidimenstional arrays. My source of confusion came from an [epic ticket](http://core.trac.wordpress.org/ticket/11520 "print_scripts_l10n() should use json_encode()") that, loosely speaking, is on the topic of associating arbitrary JS with enqueued scripts. It seems that `wp_localize_script` got the ability to handle multidimensional arrays in WordPress 3.3 (more specifically, at revision [19217](http://core.trac.wordpress.org/changeset/19217 "WordPress Core Changeset 19217")).

### Limitations of `get_queried_object_id`

Once again, Alex Mills caught an issue with some of the code I presented; this time, it was with the navigation menu caching function by Thorsten Ott. I suggested that the code I presented (an abridged version of [Thorsten's code](http://hitchhackerguide.com/2011/10/07/caching-wordpress-navigation-menus-wp_nav_menu-wrapper/ "Caching WordPress navigation menus – wp_nav_menu() wrapper")) used `get_queried_object_id` to get a unique ID for a nav menu. Unfortunately, because WordPress objects (e.g., posts, authors, taxonomy terms) exist in separate database tables, there can theoretically be clashes between the ID values returned by `get_queried_object_id` for objects of different object type. For instance, a category named "History" can have the same ID as an author named "John Doe" because these objects exist in different tables and therefore are not forced to have unique IDs. There is a way to get a truly unique ID and that involves taking into account the full queried object as well as the ID. It can be accomplished with the following code:

```php
<?php
/**
 * Get a unique ID key for current $wp_the_query object.
 *
 * @return string|int unique key on success, 0 on failure
 */
function zdt_get_object_key() {
	$queried_object = get_queried_object();
	$queried_object_id = get_queried_object_id();

	if ( ! is_null( $queried_object ) && $queried_object_id > 0 )
		return md5( serialize( $queried_object ) . $queried_object_id );
	else
		return 0;
}
```

Because this code adds the full queried object to the key, it guarantees that two different objects of different object type that share the same ID, will return a unique key.

Thanks to all who pointed out these issues in my talk! Nothing better than great minds keeping you honest!
