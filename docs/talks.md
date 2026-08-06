# Talks

Each speaking engagement is one Markdown file in `src/talks/`, rendered at
`/speaking/<filename>/` and listed on `/speaking/`. The filename carries the
date, which disambiguates the several talks that share a title.

Front matter is authoritative. Eleventy aggregates and renders it: sorting,
facet counts, headline statistics, date formatting, related-talk ranking, and
optional sections. It does not infer editorial meaning from prose, so editing a
title or an abstract cannot silently change a talk's classification, its accent
color, or which talks it links to.

## Front matter

| Field           | Required | Shape                                                |
| --------------- | -------- | ---------------------------------------------------- |
| `title`         | yes      | Clean title, with no `(Keynote)` or `Panel:` marker  |
| `date`          | yes      | Engagement date                                      |
| `datePrecision` | no       | `day` (default), `month`, or `year`                  |
| `updated`       | no       | Date the page itself last changed                    |
| `type`          | yes      | `talk`, `keynote`, `panel`, or `workshop`            |
| `topics`        | yes      | Topic slugs, primary first                           |
| `event`         | yes      | `{ name, type, location }`                           |
| `series`        | no       | Slug shared by repeat deliveries of one presentation |
| `coSpeakers`    | no       | Free text                                            |
| `description`   | no       | Abstract; blank lines split it into paragraphs       |
| `video`         | no       | `{ url, provider, duration }`                        |
| `slides`        | no       | `{ url, provider, count, download }`                 |
| `sources`       | no       | `[{ kind, publisher, title, url, note, duration }]`  |
| `quotes`        | no       | `[{ text, author, source, url }]`; stored, not shown |
| `photos`        | no       | `[{ src, alt, credit }]`                             |

`topics[0]` is the primary topic and drives the accent color on the card and the
page, so order matters. `series` is what makes two files the same presentation:
related-talk ranking scores a series match far above shared topics. A `video` or
`slides` block needs a `url`; `download: true` marks a deck hosted on this site
so it renders as a download link. A source renders as `Publisher: title`, so a
coverage link names who published it rather than standing as a bare
"WPSessions"; `label` is the older single-field form and still supplies the link
text when there is no `title`. Editorial detail about what a link contains goes
in `note`, which renders as muted text under the link and never inside the
anchor, so link text stays short enough to scan. A source `duration` is only for
a URL that is the recording itself. `updated` is the only date the sitemap
treats as `lastmod`: the engagement date says when the talk happened, not when
the page was written or revised. `quotes` keeps sourced audience reactions with
their attribution, but nothing renders them: the site does not publish praise of
its author, and the field exists so the sourcing survives rather than being
re-researched if that ever changes. `datePrecision` says how exactly the date is
known: talks still sort by the full `date`, but a `month` or `year` talk renders
and marks up only what it can support, so a stand-in day never reads as fact.

## Taxonomy

`taxonomy/talks.js` owns the controlled vocabularies and their display labels,
so a label change happens in one place instead of in every Markdown file.

| Vocabulary     | Values                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `TOPICS`       | `https-tls`, `http2`, `caching`, `git`, `performance`, `javascript`, `infrastructure`, `wordpress`                |
| `TALK_TYPES`   | `talk`, `keynote`, `panel`, `workshop`                                                                            |
| `EVENT_TYPES`  | `wordcamp`, `phpworld`, `loopconf`, `midwestphp`, `velocity`, `altitude`, `xbiz`, `meetup`, `wpsessions`, `other` |
| `SOURCE_KINDS` | `session`, `code`, `writing`, `coverage`                                                                          |

The topic order above is the order facet chips render in. A source `kind` says
what the link is: `session` for the event's own session or speaker page, `code`
for a repository, `writing` for something on this site, and `coverage` for
anything written or hosted elsewhere. Code sources render in the action row
under the header, alongside the video and the slides; the rest render in
"Links & resources".

A `session` link takes its publisher from `event.name`, because the event is
already known to be the publisher of its own page. Give such a source only a
`title` naming what the page is, in lower case: `session page`, `speaker page`,
or `schedule` when the URL lists a whole conference rather than this talk. The
result reads "WordCamp Seattle 2012: session page" without repeating the event
name in front matter, so renaming an event relabels its links. A session hosted
by somebody other than the event, such as WPSessions, states its own
`publisher` and keeps it.

## Validation

`collections/validate.js` checks every talk on each build and warns, naming the
file: an unknown `type`, missing or unknown `topics`, a missing `event.name` or
unknown `event.type`, a source with no `kind`, `url`, or `title` (or `label`),
and a `video` or `slides` block with no `url`. An unknown slug still renders as
its raw text rather than disappearing, so a typo is visible on the page as well
as in the build log.

## Adding a talk

1. Create `src/talks/YYYY-MM-DD-slug.md` with the front matter above
2. Reuse an existing `series` slug if the presentation has been given before
3. Run `npm run build` and check the build log for validation warnings
