import {
  EVENT_TYPES,
  SOURCE_KINDS,
  TOPICS,
  eventType,
  talkTypeOf,
  topic,
} from "../taxonomy/talks.js";

// Filters backing the speaking index and the individual talk pages. Talks state
// their own type, topics, series, and link kinds in front matter; these filters
// only resolve those slugs against the taxonomy and aggregate across the
// collection. Nothing here infers editorial meaning from prose.

// Resolve a talk's topic slugs to { slug, label }, preserving the order the
// talk lists them in: the first topic is the primary one and drives the accent
// color on cards and pages.
export function talkTopics(slugs) {
  if (!Array.isArray(slugs)) {
    return [];
  }
  return slugs.map(topic);
}

// Resolve a talk's type slug to { slug, label }. Missing means a plain talk.
export function talkType(slug) {
  return talkTypeOf(slug);
}

// Resolve an event type slug to { slug, label }.
export function talkEventType(slug) {
  return eventType(slug);
}

// Group source links by their declared kind. The talk page renders `code` as
// action buttons and the rest as a resource list, so an unknown kind is kept
// out of the way in `coverage` rather than dropped.
//
// A `session` link points at the event's own page for the talk, so it is the
// one kind whose publisher is already known: it is the event. Stamping it here
// from `eventName` means front matter states only what kind of page it is
// ("session page", "speaker page", "schedule") and the event name can never
// drift from `event.name`. A session link that names its own publisher, such as
// a third-party host like WPSessions, keeps it.
export function sourceGroups(sources, eventName) {
  const groups = Object.fromEntries(SOURCE_KINDS.map(kind => [kind, []]));
  for (const source of sources || []) {
    if (!source || !source.url) {
      continue;
    }
    const kind = SOURCE_KINDS.includes(source.kind) ? source.kind : "coverage";
    const needsEvent = kind === "session" && !source.publisher && eventName;
    groups[kind].push(
      needsEvent ? { ...source, publisher: eventName } : source
    );
  }
  return groups;
}

// Link text for one source: "Publisher: title", so a coverage link names who
// published it instead of standing as a bare "WPSessions". `label` is the
// pre-migration field name and still reads as the title. Editorial commentary
// lives in `note` and renders beside the link, never inside the anchor.
export function sourceLabel(source) {
  const title = source?.title || source?.label || "";
  const publisher = source?.publisher || "";
  if (publisher && title) {
    return `${publisher}: ${title}`;
  }
  return title || publisher;
}

// Topic filter facets: { slug, label, count } in taxonomy order, counting every
// talk that carries each topic. Topics nobody speaks about are omitted.
export function topicFacets(talks) {
  const counts = new Map();
  for (const talk of talks || []) {
    for (const slug of talk?.data?.topics || []) {
      counts.set(slug, (counts.get(slug) || 0) + 1);
    }
  }
  return TOPICS.filter(entry => counts.has(entry.slug)).map(entry => ({
    ...entry,
    count: counts.get(entry.slug),
  }));
}

// An event chip matching one or two talks narrows the collection to what the
// row already states in its metadata, so an event needs at least this many
// talks to earn a chip of its own.
const EVENT_FACET_MIN_COUNT = 3;

// Count talks per declared event type, then place each type in a facet: its own
// when it clears the threshold, `other` when it does not. Both eventFacets and
// eventFacetSlug read this, so a chip and the row classes it targets cannot
// disagree.
function eventFacetAssignment(talks) {
  const counts = new Map();
  for (const talk of talks || []) {
    const slug = talk?.data?.event?.type || "other";
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  const facetOf = new Map();
  const facetCounts = new Map();
  for (const [slug, count] of counts) {
    const facet = count >= EVENT_FACET_MIN_COUNT ? slug : "other";
    facetOf.set(slug, facet);
    facetCounts.set(facet, (facetCounts.get(facet) || 0) + count);
  }
  return { facetOf, facetCounts };
}

// Event filter facets in taxonomy order, so the chip row reads the same way on
// every build regardless of how the counts happen to fall. Below-threshold
// events land in `other` rather than losing their chip, which keeps every talk
// reachable from the filters.
export function eventFacets(talks) {
  const { facetCounts } = eventFacetAssignment(talks);
  const known = EVENT_TYPES.filter(entry => facetCounts.has(entry.slug)).map(
    entry => ({ ...entry, count: facetCounts.get(entry.slug) })
  );
  const unknown = [...facetCounts]
    .filter(([slug]) => !EVENT_TYPES.some(entry => entry.slug === slug))
    .map(([slug, count]) => ({ slug, label: slug, count }));
  return [...known, ...unknown];
}

// Companion lookup for eventFacets, keyed by event type slug and valued by the
// facet that type filters under. The index template indexes it to build row
// classes, so a folded event carries the class its facet targets instead of its
// own name. Event types the collection never uses are absent.
export function eventFacetSlug(talks) {
  return Object.fromEntries(eventFacetAssignment(talks).facetOf);
}

// The controls the index filters on, each pairing the CSS fragments a rule
// needs with the test the matching row class encodes: `has` detects the control
// from the inputs, `row` names the class a surviving row carries, and `matches`
// answers the same question against the talk. Keeping the three together is
// what stops a state's talk count from describing a different set than its
// selector does.
function filterControls(talks) {
  const facetOf = eventFacetSlug(talks);
  return {
    format: [
      {
        has: ":has(#flt-video:checked)",
        row: ".has-video",
        matches: talk => Boolean(talk?.data?.video?.url),
      },
      {
        has: ":has(#flt-slides:checked)",
        row: ".has-slides",
        matches: talk => Boolean(talk?.data?.slides?.url),
      },
    ],
    topic: topicFacets(talks).map(facet => ({
      has: `:has(#top-${facet.slug}:checked)`,
      row: `.topic-${facet.slug}`,
      matches: talk => (talk?.data?.topics || []).includes(facet.slug),
    })),
    event: eventFacets(talks).map(facet => ({
      has: `:has(#evt-${facet.slug}:checked)`,
      row: `.evt-${facet.slug}`,
      matches: talk =>
        (facetOf[talk?.data?.event?.type || "other"] || "other") === facet.slug,
    })),
  };
}

// Every filter state the index can reach, as { has, row, classes, count }: the
// `:has()` chain that detects the state, the compound a row must carry to
// survive it, that compound split into its classes, and how many talks the
// state matches. The format checkboxes are independent, so all four of their
// combinations appear; the Topic and Event radios contribute at most one
// control each, and the leading empty entry stands for their "All" option.
// Both the year-group rules and the empty-state rule are built from this one
// list, so the page cannot hide every group in a state the empty message
// considers populated.
export function talkFilterStates(talks) {
  const items = talks || [];
  const { format, topic, event } = filterControls(items);
  const formatStates = [[], [format[0]], [format[1]], format];
  const radioStates = controls => [[], ...controls.map(control => [control])];
  const states = [];
  for (const fmt of formatStates) {
    for (const top of radioStates(topic)) {
      for (const evt of radioStates(event)) {
        const active = [...top, ...evt, ...fmt];
        states.push({
          has: [...fmt, ...top, ...evt].map(control => control.has).join(""),
          row: active.map(control => control.row).join(""),
          classes: active.map(control => control.row),
          count: items.filter(talk =>
            active.every(control => control.matches(talk))
          ).length,
        });
      }
    }
  }
  return states;
}

// The zero-result states that need a rule of their own. Filters only narrow, so
// a state matching no talk still matches none once more filters join it, and a
// rule written for the loosest such state already fires in every state below
// it. Dropping the covered states shortens the emitted selector list without
// leaving a state uncovered.
export function emptyFilterStates(states) {
  const empty = (states || []).filter(state => state.count === 0);
  return empty.filter(
    state =>
      !empty.some(
        other =>
          other !== state &&
          other.classes.every(cls => state.classes.includes(cls))
      )
  );
}

// Fold the collection into [{ year, talks }] groups, newest year first, so the
// index renders one year heading per group instead of repeating the year on
// every row. Talks keep the order the collection hands over, which is already
// newest first within a year. A talk whose date yields no year groups under
// `year: null` and sorts last, so a malformed item still reaches the index.
export function talksByYear(talks) {
  const groups = new Map();
  for (const talk of talks || []) {
    const value = talk?.date?.getUTCFullYear?.();
    const year = Number.isFinite(value) ? value : null;
    if (!groups.has(year)) {
      groups.set(year, []);
    }
    groups.get(year).push(talk);
  }
  const rank = year => (year === null ? -Infinity : year);
  return [...groups]
    .map(([year, items]) => ({ year, talks: items }))
    .sort((a, b) => rank(b.year) - rank(a.year));
}

// Headline numbers for the speaking index hero.
export function speakingStats(talks) {
  const items = talks || [];
  const years = items
    .map(talk => talk?.date?.getUTCFullYear?.())
    .filter(Number.isFinite);
  return {
    count: items.length,
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
    withVideo: items.filter(talk => talk?.data?.video?.url).length,
    withSlides: items.filter(talk => talk?.data?.slides?.url).length,
  };
}

// Rank related talks: another delivery of the same presentation (matching
// `series`) scores highest, then talks that share the most topics. Returns up
// to `limit` collection items, newest first within a score. The current talk is
// identified by inputPath.
export function relatedTalks(talks, inputPath, limit) {
  const items = talks || [];
  const max = limit || 4;
  const current = items.find(talk => talk.inputPath === inputPath);
  if (!current) {
    return [];
  }
  const currentTopics = current.data.topics || [];
  const currentSeries = current.data.series;
  return items
    .filter(talk => talk.inputPath !== inputPath)
    .map(talk => {
      const shared = (talk.data.topics || []).filter(slug =>
        currentTopics.includes(slug)
      ).length;
      const sameSeries =
        currentSeries && talk.data.series === currentSeries ? 1 : 0;
      return { talk, score: sameSeries * 100 + shared };
    })
    .filter(scored => scored.score > 0)
    .sort((a, b) => b.score - a.score || b.talk.date - a.talk.date)
    .slice(0, max)
    .map(scored => scored.talk);
}
