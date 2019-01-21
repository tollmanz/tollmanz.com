---
layout:     post
title:      "Sending Email With Git, Gmail, and OS X"
date:       2013-05-15 23:30:00
categories: git send-email os-x gmail
slug:       git-send-email-gmail-os-x
---

With Git, you can generate patch files and have git send the patches via Gmail through the command line. Patches are an excellent alternative to Github's pull requests as it properly credits the author and committer.

To generate a patch:

```bash
git format-patch --cover-letter origin/master -o outgoing/
```

This command will create a patch file for each commit that does not exist in `origin/master`. It will create a "cover letter" that summarizes the changes. All of the files will be added to the "outgoing" directory.

To configure Git's global send mail setting, use the following commands and substitute your information:

```bash
git config --global sendemail.from MacGruber <mac@gruber.com>
git config --global sendemail.smtpserver smtp.gmail.com
git config --global sendemail.smtpserverport 587
git config --global sendemail.smtpencryption tls
git config --global sendemail.smtpuser mac@gruber.com
```

With the SMTP setting added to the config, try sending an email.

```bash
git send-email outgoing/*
```

Answer the prompts for the recipient email address and to send the individual emails. If the emails send, your work is done. When I first set it up, I received the following error:

```bash
Can't locate Net/SMTP/SSL.pm in @INC (@INC contains: /usr/local/Cellar/git/1.8.2.1/lib /Library/Perl/5.12/darwin-thread-multi-2level /Library/Perl/5.12 /Network/Library/Perl/5.12/darwin-thread-multi-2level /Network/Library/Perl/5.12 /Library/Perl/Updates/5.12.4 /System/Library/Perl/5.12/darwin-thread-multi-2level /System/Library/Perl/5.12 /System/Library/Perl/Extras/5.12/darwin-thread-multi-2level /System/Library/Perl/Extras/5.12 .) at /usr/local/Cellar/git/1.8.2.1/libexec/git-core/git-send-email line 1165.
```

To fix this issue, I ran:

```bash
sudo -H cpan Net::SMTP::SSL
```

After running the `git send-email` command again, the patches were successfully emailed!

References:

* [More Fedora: Configuring git send-email to use Gmail SMTP](http://morefedora.blogspot.com/2009/02/configuring-git-send-email-to-use-gmail.html)
* [Installing Net::SMTP::SSL for sending patches with Git over secure SMTP](http://kbase.wincent.com/old/knowledge-base/Installing_Net::SMTP::SSL_for_sending_patches_with_Git_over_secure_SMTP.html)
