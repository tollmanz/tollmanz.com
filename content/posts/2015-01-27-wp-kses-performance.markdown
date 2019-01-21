---
layout:     post
title:      "wp_kses Performance"
date:       2015-01-26 21:00:00
categories: security
---

How performant are the `wp_kses` family of functions in WordPress? Folk wisdom and common sense suggest that they are slow. It seems that as long as I have been involved in the WordPress community, I have heard that the `wp_kses` functions should not be used when handling output printed to the screen, with the primary reason being that they are not performant.

If you are not familiar with `wp_kses`, it is a function used in WordPress to sanitize HTML content. `wp_kses`, which stands for "kses strips evil scripts", is wonderfully summed up by [Otto](http://ottopress.com/page/13/):

> It can read HTML code, no matter how malformed it is, and filter out undesirable bits. The idea is to allow some safe subset of HTML through, so as to prevent various forms of attacks.

Recently, at work, I noticed a number of uses of `wp_kses_post`, a wrapper of `wp_kses`, in our theme, declared that we should *never* have this in our code, went through and removed them all, broke a bunch of stuff, reverted it all, and decided that I actually need to better understand the performance characteristics of the functions. Frankly, I was uncomfortable using the function as I had previously understand that it was bad for performance. I needed to get answers, so I rolled up my sleeves and began exploring `wp_kses` performance.

### `wp_kses` Background

My initial approach to answering the `wp_kses` performance question was to look for someone else discussing it online. I found very little. Other than a Mark Jaquith [comment](http://mikejolley.com/2013/08/keeping-your-shit-secure-whilst-developing-for-wordpress/#comment-1001881940) on a post discouraging its use, a comment [mention](https://github.com/10up/Engineering-Best-Practices/blob/c7d7df9fcae5aa5e42a3eebd91017a8b926d7879/_includes/markdown/PHP.md#escape-or-validate-output) in 10up's [Best Practices document](https://github.com/10up/Engineering-Best-Practices) about it having "bad performance", and a notable omission from WordPress.com VIP's guide to [validating, sanitizing, and escaping](http://vip.wordpress.com/documentation/validating-sanitizing-escaping/), I could not find any resource that provided evidence, antidotes or a solid reason for not using the function.

I looked up the history of the functions and found that they came from the [*kses - PHP HTML/XHTML filter*](http://sourceforge.net/projects/kses/) open source project. It was [introduced to WordPress](https://core.trac.wordpress.org/changeset/649) in 2003 (ironically on my birthday) when the kses library was at version 0.2.1 (it seemed to cease development at version 0.2.2). One day after being added to WordPress, it was used for the first time as it was applied to [post comments](https://core.trac.wordpress.org/changeset/650). Interestingly, the functions were applied to comments *on the front end as they were printed to the screen*, not on the backend on save. Just less than [one year later](https://core.trac.wordpress.org/changeset/1964), the functions were removed from being applied to post comments on output and were instead applied to comments on when saved to the database. Unfortunately, the commit message is a measly "Comments refactoring and cleanup" and I could not find a papertrail for the changeset<span class="footnote-article-number">1</span>.

In late 2005, `wp_kses` was finally [applied to post content](https://core.trac.wordpress.org/ticket/1674) (if you look at the patch, it's applied via `content_save_pre`)<span class="footnote-article-number">2</span>. As far as I can tell, this was the first time the `wp_kses` functions were applied to content. Nothing in the patch suggests that the functionality was previously present elsewhere. If my reading of this is correct, `wp_kses` was never applied to post content on the front end. It also seems that if it took almost two years to apply the function to post content, the main concern for `wp_kses` was to *sanitize non-WordPress user content* only. This patch also updated the kses functions to version 0.2.2.

Currently, `wp_kses` is applied to comments and post content very similarly to the way that it was all the way back in 2005. Not much has changed about the actual mechanism. Looking through these changesets does not give us any insight into *why* these changes were made, although, it's likely safe to assume that it was performance related.

Without my Googling and Trac-diving answering my performance questions, I decided that I might as well test the performance for myself.

### Methods

Taking an [idea](https://github.com/aaronjorbin/php-memcache-performance) from [Aaron Jorbin](http://aaron.jorb.in/), I build a [test script](https://github.com/tollmanz/kses-cases/blob/master/tests.php) that runs tests via [Travis CI](https://github.com/tollmanz/kses-cases/blob/master/.travis.yml), making it easy to run the tests on PHP 5.3-5.6 and the [HipHop Virtual Machine (HHVM)](http://hhvm.com/). The tests generate mean, median, range, and standard deviation for four functions: `wp_kses_post`, `wp_kses_p` (`wp_kses` with an `$allowed_html` argument that only allows tags/attributes that are valid between `p` tags), `esc_html`, and `esc_attr`. I tested the custom `wp_kses_p` function to serve as a comparison for limiting the scope of the `$allowed_html` sent to the function. Given that `esc_html` and `esc_attr` are highly encouraged escaping functions in WordPress, I thought they would serve as a great basis of comparison. These functions appear to strike a nice balance between being secure with acceptable performance to justify their profilic use. Each function is also tested against three content lengths: long (post content length), medium (excerpt length), and short (title length). Finally, each function is tested 1000 times against the three different content lengths in each of the five PHP/HHVM environments to give us a broad picture of the function performance.

The versions of the functions tested where extracted from WordPress. In order to both avoid having to install WordPress on Travis CI and to isolate `wp_kses` performance from all other WordPress functioning, I pulled all the `wp_kses`, `esc_html` and `esc_attr` functions and dependencies out of WordPress for easier access to them. This should allow us to be more confident that the observed performance characteristics are due to the functions and the functions alone.

### Results

Unsurprisingly, the results of the tests show that the `wp_kses` functions are indeed slower than the comparison functions as seen in the tables below (all times in ms), which displays the mean performance for each function for each content length and environment. Where things get interesting is when we start to look at the size of the differences. Figures 1, 2, and 3 demonstrate the mean function performance for the different content lengths. One can see that as the tests move from long to short content, the performance times begin to converge between `wp_kses` and the comparison functions. This is a common sense finding in that it's reasonable to think that less content means less work and more performant processes.

<h4 class="table-header">Long content</h4>

|      | wp_kses_post | wp_kses_p | esc_html | esc_attr |
| ---- | ------- | --------- | -------- | -------- |
| 5.3  | 22.863  | 12.201    | 1.638    | 1.640    |
| 5.4  | 22.651  | 12.236    | 0.725    | 0.728    |
| 5.5  | 24.337  | 13.095    | 0.685    | 0.687    |
| 5.6  | 28.930  | 21.279    | 1.029    | 0.725    |
| HHVM | 2.022   | 1.139     | 0.326    | 0.297    |

<p class="table-note"><em>Time in ms</em></p>

<h4 class="table-header">Medium content</h4>

|      | wp_kses_post | wp_kses_p | esc_html | esc_attr |
| ---- | ------- | --------- | -------- | -------- |
| 5.3  | 0.319   | 0.252     | 0.055    | 0.055    |
| 5.4  | 0.283   | 0.246     | 0.052    | 0.053    |
| 5.5  | 0.303   | 0.248     | 0.051    | 0.051    |
| 5.6  | 0.300   | 0.247     | 0.052    | 0.052    |
| HHVM | 0.022   | 0.020     | 0.006    | 0.005    |

<p class="table-note"><em>Time in ms</em></p>

<h4 class="table-header">Short content</h4>

|      | wp_kses_post | wp_kses_p | esc_html | esc_attr |
| ---- | ------- | --------- | -------- | -------- |
| 5.3  | 0.133   | 0.097     | 0.049    | 0.050    |
| 5.4  | 0.130   | 0.095     | 0.046    | 0.047    |
| 5.5  | 0.130   | 0.094     | 0.045    | 0.045    |
| 5.6  | 0.130   | 0.094     | 0.045    | 0.045    |
| HHVM | 0.009   | 0.008     | 0.003    | 0.003    |

<p class="table-note"><em>Time in ms</em></p>

If we look at the mean performance for the 5.3-5.6 environments for the long content, `wp_kses` (*M* = 24.34ms) is 1.68 times slower than `wp_kses_p` (*M* = 14.70ms), 24.23 times slower than `esc_html` (*M* = 1.02ms), and 26.13 times slower than `esc_attr` (*M* = 0.95ms). It is faster to reduce the array of allowed HTML tags and *much* faster to sanitize using simpler functions. These "fast" functions are performing at the speed of what I usually quantify as a sufficiently fast MySQL query in WordPress and the `wp_kses` functions are much slower than that.

![](/media/images/wp-kses-long.jpg "Long content results")

Looking at the mean performance for the 5.3-5.6 environments for the medium content, the `wp_kses` functions are still slower, but the difference is reduced. `wp_kses` (*M* = 0.30ms) is 1.22 times slower than `wp_kses_p` (*M* = 0.25ms), 5.70 times slower than `esc_html` (*M* = 0.05ms), and 5.73 times slower than `esc_attr` (*M* = 0.05ms). While the performance is still much slower for `wp_kses`, the performance for `wp_kses` itself, is sub-millisecond performance, which is pretty good given what the function is doing. It is important to note the differences between the functions; however, it's probably more important to note the raw performance of each function given that the performance is fairly reasonable against medium content.

![](/media/images/wp-kses-medium-2.jpg "Medium content results")

Finally, comparing the mean performance of `wp_kses` against the other functions for the 5.3-5.6 environments when processing short content continues the convergence trend. All functions are performing admirably. `wp_kses` (*M* = 0.13ms) is 1.38 times slower than `wp_kses_p` (*M* = 0.09ms), 2.81 times slower than `esc_html` (*M* = 0.05ms), and 2.80 times slower than `esc_attr` (*M* = 0.05ms). Again, we see performance differences, but looking at the raw values, all of them are performing acceptably quick.

![](/media/images/wp-kses-short-2.jpg "Short content results")

I have not mentioned the HHVM results yet. My focus is on the 5.x PHP versions given that that is how WordPress is currently deployed. You can see the data in the charts and tables in this post. I will mention that HHVM performed remarkably well. The differences between the functions were reduced greatly. In the long content condition with `wp_kses`, the mean execution time was merely 2.02ms; pretty great!

### Conclusion

In my opinion, a blanket policy that dictates that `wp_kses` should not be used on the frontend is largely misguided. There are situations in which use of the function would not present a meaningful performance impact. Notably, small pieces of content (e.g., titles, excerpts) with a short list of allowed HTML tags appears to perform well within the bounds of reason. It also seems that running the `wp_kses` functions against larger content is not out of the question. I would not qualify it as performant, but I certainly am not seeing levels of performance that suggest it should always not be used. As it often is the case, security and performance can be at odds with one another; choosing one, compromises the other. In the case of `wp_kses`, I would be comfortable deploying an application with deliberate and judicious use of the functions while feeling safe that it is secure and performant; however, each case should be considered individually.

<p class="footnote"><span class="footnote-footer-number">1</span> It should be noted that the latest version of PHP at this time was 4.3.x. I <a href="https://github.com/tollmanz/kses-cases/commit/e274440559b97fe70df59194cd81f1b72d5db96a">attempted to test against this version of PHP</a> but it was unavailable in the Travis CI environment and I stopped trying after that. I was hoping to take a look at the performance when the decision to remove <code>wp_kses</code> from post comments was made.</p>

<p class="footnote"><span class="footnote-footer-number">2</span> This patch by Donncha is historic and prophetic. His comment from <em>9 years ago</em>: "I didn't filter on <code>content_save_pre</code> because that's destructive of the actual post. On the other hand, the post writer might wonder why his wacky javascript is being deleted when it's displayed..." What WordPress developer hasn't been asked by a client about why his/her javascript went missing during a post save? Now you know where to point your clients!</p>
