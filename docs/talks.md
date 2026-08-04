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

| Field         | Required | Shape                                                |
| ------------- | -------- | ---------------------------------------------------- |
| `title`       | yes      | Clean title, with no `(Keynote)` or `Panel:` marker  |
| `date`        | yes      | Engagement date                                      |
| `type`        | yes      | `talk`, `keynote`, `panel`, or `workshop`            |
| `topics`      | yes      | Topic slugs, primary first                           |
| `event`       | yes      | `{ name, type, location }`                           |
| `series`      | no       | Slug shared by repeat deliveries of one presentation |
| `coSpeakers`  | no       | Free text                                            |
| `description` | no       | Abstract; blank lines split it into paragraphs       |
| `video`       | no       | `{ url, provider, duration }`                        |
| `slides`      | no       | `{ url, provider, count, download }`                 |
| `sources`     | no       | `[{ kind, label, url, duration }]`                   |
| `quotes`      | no       | `[{ text, author, url }]`                            |
| `photos`      | no       | `[{ src, alt, credit }]`                             |

`topics[0]` is the primary topic and drives the accent color on the card and the
page, so order matters. `series` is what makes two files the same presentation:
related-talk ranking scores a series match far above shared topics. A `video` or
`slides` block needs a `url`; `download: true` marks a deck hosted on this site
so it renders as a download link. A source `duration` is only for a URL that is
the recording itself. Attendance figures are not modeled: an event's headcount
says nothing about who was in the room for one session.

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
anything written or hosted elsewhere. Code sources render as action buttons; the
rest render in "Links & resources".

## Validation

`collections/validate.js` checks every talk on each build and warns, naming the
file: an unknown `type`, missing or unknown `topics`, a missing `event.name` or
unknown `event.type`, a source with no `kind`, `label`, or `url`, and a `video`
or `slides` block with no `url`. An unknown slug still renders as its raw text
rather than disappearing, so a typo is visible on the page as well as in the
build log.

## Adding a talk

1. Create `src/talks/YYYY-MM-DD-slug.md` with the front matter above
2. Reuse an existing `series` slug if the presentation has been given before
3. Run `npm run build` and check the build log for validation warnings
