---
layout:     post
title:      "Git \"amend\" without Editing the Comment"
date:       2014-09-02 08:45:00
categories: git
slug:       git-amend-without-comment-edit
---

Git's `--amend` flag for the `commit` command is a helpful utility for updating a commit. It allows you to "edit" a previous commit. In my workflow, this tends to happen a lot. I make a commit, realize that I need to change something else for the commit, make and stage the change, then amend the commit. It looks something like:

```bash
git add -p # Select changes to add
git commit --amend
```

The issue with this method is that your editor opens allowing you to make a change to the commit message. Most of the time that I need to use `--amend`, I do not need to make the commit message. The "open the editor and close it" routine gets to be a bit frustrating.

To simplify this workflow, you can amend a commit without opening the editor to change the commit message. It is as simple as:

```bash
git commit --amend --no-edit
```

Yes. This is simple and totally obvious. I was curious why I never knew this before given that I use `--amend` so much. It turns out that the `--no-edit` flag was added in Git 1.7.9. I am guessing that I started looking for a solution prior to Git 1.7.9 and eventually gave up, assuming that this was not possible.

References:

* [Stackoverflow: git commit --amend --use-existing-message? (no editor interaction)](http://stackoverflow.com/questions/10237071/git-commit-amend-use-existing-message-no-editor-interaction)
