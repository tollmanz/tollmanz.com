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
export function sourceGroups(sources) {
  const groups = Object.fromEntries(SOURCE_KINDS.map(kind => [kind, []]));
  for (const source of sources || []) {
    if (!source || !source.url) {
      continue;
    }
    const kind = SOURCE_KINDS.includes(source.kind) ? source.kind : "coverage";
    groups[kind].push(source);
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

// Most talks a featured tier may hold. A tier that grows stops being a
// shortlist, so the cap is enforced here rather than trusted to front matter:
// flagging a sixth talk shortens the list from the bottom instead of widening
// the section.
export const FEATURED_LIMIT = 5;

// The featured shortlist for the index, newest first because the collection
// already arrives that way. Talks opt in with `featured: true`; anything else,
// including a truthy string, is not an opt-in.
export function featuredTalks(talks) {
  return (talks || [])
    .filter(talk => talk?.data?.featured === true)
    .slice(0, FEATURED_LIMIT);
}

// Longest hook a featured card takes. A card holds one line, so a hook longer
// than this is passed over rather than cut.
const HOOK_MAX_LENGTH = 200;

// Leading sentence of `text`, or "" when the opening sentence is longer than a
// card can hold. Only the first paragraph is considered: an abstract's later
// paragraphs are context, not a summary.
function firstSentence(text) {
  const paragraph = String(text || "")
    .split(/\n\s*\n/)[0]
    .trim();
  if (!paragraph) {
    return "";
  }
  const match = paragraph.match(/^[\s\S]*?[.!?](?=\s|$)/);
  const sentence = (match ? match[0] : paragraph).trim();
  return sentence.length <= HOOK_MAX_LENGTH ? sentence : "";
}

// One-line hook for a featured card as { text, cite, quote }, or null when the
// talk offers nothing short enough. An audience quote outranks the abstract,
// and the shortest quote that fits wins. The hook is chosen whole rather than
// clipped, so a card never shows half a sentence.
export function talkHook(data) {
  const quotes = (data?.quotes || [])
    .filter(entry => entry?.text && entry.text.length <= HOOK_MAX_LENGTH)
    .sort((a, b) => a.text.length - b.text.length);
  if (quotes.length) {
    const [quote] = quotes;
    return {
      text: quote.text,
      cite: quote.author || quote.source || "",
      quote: true,
    };
  }
  const sentence = firstSentence(data?.description);
  return sentence ? { text: sentence, cite: "", quote: false } : null;
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
