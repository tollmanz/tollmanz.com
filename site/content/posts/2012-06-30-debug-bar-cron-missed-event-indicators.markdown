---
layout:     post
title:      "Debug Bar Cron 0.1.2: Missed Event Indicators"
date:       2012-06-30 20:37:00
categories: plugins
---

Tonight, I released version 0.1.2 of Debug Bar Cron. [Jeremy Felt](http://jeremyfelt.com/ "The Home of Jeremy Felt"), my awesome [10up](http://10up.com "10up LLC") co-worker, pointed out that the times reported for events were always [positive](https://github.com/tollmanz/debug-bar-cron/issues/2 "Debug Bar Cron GitHub Issue 2"). In other words, if an event was scheduled for 2 minutes ago, its scheduled time was reported as "2 mins" instead of "2 mins ago", implying that the event is schedule to occur in the future, as opposed to having been missed in the past. The function used to provide this time difference, [`human_time_diff`](http://codex.wordpress.org/Function_Reference/human_time_diff "Codex Function Reference: human_time_diff"), does not provide indications whether the time difference is in the future or past. As such, I had to manually add this to the output.

When viewing the event times, "ago" will be printed after the time difference if the event is in the past. It should be noted that it is not necessarily an issue if you see an event time that is in the past. Due to the way that WordPress scheduled events work, the event will always fire after the scheduled time. If WordPress scheduled events are working correctly, Debug Bar Cron should report "Yes" as the value for "Doing Cron" when past events are shown. That said, if you load the page, notice that an event was scheduled to run prior to the current time **and** the "Doing Cron" indicator is set to "No", there is likely an issue with WordPress scheduled events executing. In that case, the missed events will be highlighted in red as shown below.

![](/media/images/missed-event.jpg "missed-event")

Note that if this is not cleared up with a reload or two, or if you find that you have numerous events showing in red, it is more than likely that wp-cron.php is not working correctly on your WordPress installation and steps need to be taken to remediate the issue. I am considering trying to add some more debug information about what that problem might be, but that takes careful consideration and time to implement.
