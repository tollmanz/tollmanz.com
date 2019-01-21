---
layout:     post
title:      "WordCamp Chicago 2013: Enhancing Developer Creativity with Git"
date:       2013-06-30 08:24:00
categories: git
---

Today, I had the opportunity to speak at WordCamp Chicago 2013. In an unusal twist for me, I spoke about git, which is a very non-WordPress topic. While I typically like to write a more thorough post to summarize my talks, time was simply not on my side this week. As such, I am including a very short synopsis of my talk with a link to my slides. 

The main thesis of my &#8220;Enhancing Developer Creativity With Git&#8221; talk was that fear can impair creativity and one can overcome his/her fear of git. The three &#8220;fears&#8221; that I addressed were:

*   Fear of not having an undo
*   Concern about merging your work
*   Fear of committing regressions

For each of these concerns, I discussed &#8220;cures&#8221; for the fears. With regard to concerns about undoing commits, I talked about git&#8217;s [`reflog`](http://fiji.sc/Git_reflogs) feature that keeps a local log of actions that change the HEAD state of the repository. With `reflog` you can easily reset your repository to a previous state in the same way you would expect an &#8220;undo&#8221; command to work. I highly recommend reading about `reflog` as it is a really powerful tool for viewing your local history to &#8220;undo&#8221; problems with your repository.

I then discussed different strategies for [merging topic branches](http://git-scm.com/book/en/Git-Branching-Basic-Branching-and-Merging) into mainline branches. In addition to committing early and often, I suggested that it is best if you also put effort into your merges. Git offers a number of powerful rools for merging. By walking through examples of [`git merge --squash`](http://stackoverflow.com/questions/5308816/how-to-use-git-merge-squash), [`git merge --no-ff`](http://nvie.com/posts/a-successful-git-branching-model/), and [`git rebase -i`](https://help.github.com/articles/interactive-rebase), I demonstrated how it is possible to sculpt your git history to tell the story that you want it to tell.

Finally, I discussed one of my favorite git tools, [`git bisect`](http://webchick.net/node/99), which allows you to quickly find a commit that introduced a regression into a repo. Git bisect uses a [binary search](http://en.wikipedia.org/wiki/Binary_search_algorithm) strategy for finding the offending commit. I used the example of an easy to miss bug in a theme that I recently worked on. It took only about 3 minutes to identify and fix the bug using `git bisect` where I otherwise would have spent in excessive of 2&#8211;3 hours working on the issue.

Overall, I introduced a number of tools that help free developers from the concerns of a linear VCS system. Instead of being so concerned about every commit, my talk focused on allowing developer to think more about their work and less about their VCS and repo history, which serves to foster more creativity and freedom in their work.

The slides for the talk [are available for download](http://tollmanz.com/media/pdf/WCCHI.pdf).