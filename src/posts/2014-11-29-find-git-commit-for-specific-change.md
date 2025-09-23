---
layout: post.njk
title:      "Locate Git Commit for Specific Change"
date:       2014-11-29 23:01:00
categories: git
permalink: /find-git-commit-for-specific-change/
---

Every now and again, you may need to track down a commit in which a specific change was made. While you can try using `git blame` to find the last time that a line was changed, that may not necessarily lead you to a commit in which a initial piece of code was committed. I was presented this challenge tonight when I was asked [why I introduced a changeset](https://core.trac.wordpress.org/ticket/29867#comment:4) in WordPress. Seeing as this was a change to CSS, and more specifically to `z-index`, I had no clue why I would do such a thing. I just do not work on CSS, especially issues with `z-index`.

Turns out, this code that I added as part of a patch to WordPress, was actually written by a different developer. In an attempt to be helpful, I needed to track down which commit added this code. If I could find this commit, I could potentially answer the question of "why was `!important` used to set the `z-index` for this element." Fortunately, this was actually quite easy with Git.

I needed to first find every changeset that included the line in question. In this case, I wanted to search all changesets that included `z-index: 500 !important`. To do so, I only needed the `-G` option with git. As mentioned in the [Git documentation](http://git-scm.com/docs/git-log), `git log -G` will:

> Look for differences whose patch text contains added/removed lines that match `<regex>`

The following command showed me all commits that included this code:

```bash
git log -G "z-index: 500 !important" --oneline`
```

This command gave me:

```bash
d7587c8 removed `toolbar.css` from `/components/responsive/`
fcd6102 renamed toolbar.css to admin-bar.css to keep it uniform
4dc926a Update responsive CSS and JS so we can load it in the front end without loading all of the wp
6e6c2d8 Swap the responsive menu from right to to left, to see if we like it on this side.
```

This output told me that four commits included the "important" `z-index` change. The next step was to look at the changeset introduced by each commit to see which one introduced the change that I cared about. Surprisingly, this was slightly more complicated than I thought it might be. I found two options to surface the changeset for the commit. The first was `git show $commit`. This command will show the commit message and the diff for the commit. In this case, I started with the first commit, by typing:

```bash
git show 6e6c2d8
```

Which produced:

```bash
commit 6e6c2d8ae25ac8f35778b695755af3109d5b3601
Author: iammattthomas <iammattthomas@b8457f37-d9ea-0310-8a92-e5e31aec5664>
Date:   Wed Apr 24 22:35:06 2013 +0000

    Swap the responsive menu from right to to left, to see if we like it on this side.

    git-svn-id: https://plugins.svn.wordpress.org/mp6/trunk@703123 b8457f37-d9ea-0310-8a92-e5e31aec56

diff --git a/components/responsive/css/shared.css b/components/responsive/css/shared.css
index e75483c..50b0588 100644
--- a/components/responsive/css/shared.css
+++ b/components/responsive/css/shared.css
@@ -52,7 +52,7 @@ html.wp-toolbar {
        padding-top: 46px;
 }
 #wpadminbar {
-       z-index: 500;
+       z-index: 500 !important;
        height: 46px;
        min-width: 240px;
 }
@@ -111,9 +111,6 @@ html.wp-toolbar {
        width: 28px;
lines 1-23
```

This was great, and as you can see, it showed me the piece of code that I was hoping to find. I was able to identify `6e6c2d8` as the source of the `z-index` introduction.

Now, that worked perfectly well in my use case; however, I prefer to use an external difftool when reviewing Git diffs. I use the excellent [Kaleidoscope](http://www.kaleidoscopeapp.com/) and wanted to be able to see this change in that tool to see a better overview of all of the changes in that commit. I found that you can use `git difftool` for this purpose with a slight variation on an otherwise familiar diffing syntax. The following command gave me exactly what I wanted:

```bash
git difftool 6e6c2d8~1..6e6c2d8
```

This command led to the following in Kaleidoscope:

![](/media/images/kaleidoscope-diff.jpg "kaleidoscope-diff")

The command essentially says, "show me the difference between the commit prior to `6e6c2d8` and commit `6e6c2d8` using my `difftool`." This command allowed me to examine the diff in the tool that I am most comfortable with. It showed me the same information as `git show`, but allowed me to use a better UI to view the changes.

I should note that I did look at the other three commits that changed this line of code. Those three commits were all refactors of the code and were responsible for moving large chunks of code around the plugin and thus did not factor into *the reason why* the code was committed.

References:

* [Stackoverflow: git show commit in beyond compare](http://stackoverflow.com/questions/7515213/git-show-commit-in-beyond-compare)
