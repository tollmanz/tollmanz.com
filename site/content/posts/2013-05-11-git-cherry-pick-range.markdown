---
layout:     post
title:      "Cherry Picking a Range of Commits with Git"
date:       2013-05-11 08:25:00
categories: git merge cherry-pick
---

Git has many methods for merging branchs, including the very unsophisticated [cherry pick](https://www.kernel.org/pub/software/scm/git/docs/git-cherry-pick.html) method. Its primary purpose it to copy individual commits from one branch to another.

Cherry picking a range of commits is not too difficult, but it does come with a strange syntax that I often forget. The basic form of cherry picking a range of commits is:

```bash
git cherry-pick ebe6942..905e279
```

The first hash in the range is the oldest commit and the last hash in the range is the newest commit. The confusion with this form of the cherry pick merge is that the first hash listed in the range is not included in the commit. The last hash is included. I find it difficult to keep track of which hash is included and which is not.

As a result, my preferred syntax for including a range of commits in a cherry pick that is inclusive of both range endpoints is:

```bash
git cherry-pick ebe6942^..905e279
```

This syntax will include the first commit object. This inclusion is what I assume the range commit will do by default and I often get tripped up and confused by it.

References:

* [Stackoverflow: How to cherry pick a range of commits and merge into another branch](http://stackoverflow.com/questions/1994463/how-to-cherry-pick-a-range-of-commits-and-merge-into-another-branch)
