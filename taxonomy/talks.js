// The controlled vocabularies talk front matter draws on. Talks store slugs;
// this file owns the display labels and the order they appear in, so a label
// change happens once instead of in 34 Markdown files.

// Topics, in the order their filter chips and facet counts render. A talk lists
// its own topics with the primary one first, which is what drives the accent
// color; this order only decides how the taxonomy itself is presented.
export const TOPICS = [
  { slug: "https-tls", label: "HTTPS & TLS" },
  { slug: "http2", label: "HTTP/2" },
  { slug: "caching", label: "Caching" },
  { slug: "git", label: "Git" },
  { slug: "performance", label: "Performance" },
  { slug: "javascript", label: "JavaScript" },
  { slug: "infrastructure", label: "Infrastructure" },
  { slug: "wordpress", label: "WordPress" },
];

// Engagement formats. Anything other than `talk` renders as a badge.
export const TALK_TYPES = [
  { slug: "talk", label: "Talk" },
  { slug: "keynote", label: "Keynote" },
  { slug: "panel", label: "Panel" },
  { slug: "workshop", label: "Workshop" },
];

// Event families, used for the event filter chips.
export const EVENT_TYPES = [
  { slug: "wordcamp", label: "WordCamp" },
  { slug: "phpworld", label: "php[world]" },
  { slug: "loopconf", label: "LoopConf" },
  { slug: "midwestphp", label: "MidwestPHP" },
  { slug: "velocity", label: "Velocity" },
  { slug: "altitude", label: "Fastly Altitude" },
  { slug: "xbiz", label: "XBIZ" },
  { slug: "meetup", label: "Meetup" },
  { slug: "wpsessions", label: "WPSessions" },
  { slug: "other", label: "Other" },
];

// What a source link is, in the order the talk page renders the groups. `code`
// is pulled out as action buttons; `writing` means something on this site.
export const SOURCE_KINDS = ["session", "code", "writing", "coverage"];

function bySlug(entries) {
  return new Map(entries.map(entry => [entry.slug, entry]));
}

const TOPICS_BY_SLUG = bySlug(TOPICS);
const TALK_TYPES_BY_SLUG = bySlug(TALK_TYPES);
const EVENT_TYPES_BY_SLUG = bySlug(EVENT_TYPES);

// Each lookup falls back to the raw slug rather than throwing or dropping the
// value: an unknown slug is a content error that collection validation already
// warns about, and the page should still render something readable.
function lookup(map, slug) {
  const key = String(slug || "");
  return map.get(key) || { slug: key, label: key };
}

export function topic(slug) {
  return lookup(TOPICS_BY_SLUG, slug);
}

export function talkTypeOf(slug) {
  return lookup(TALK_TYPES_BY_SLUG, slug || "talk");
}

export function eventType(slug) {
  return lookup(EVENT_TYPES_BY_SLUG, slug || "other");
}

export function isKnownTopic(slug) {
  return TOPICS_BY_SLUG.has(String(slug));
}

export function isKnownTalkType(slug) {
  return TALK_TYPES_BY_SLUG.has(String(slug));
}

export function isKnownEventType(slug) {
  return EVENT_TYPES_BY_SLUG.has(String(slug));
}

export function isKnownSourceKind(kind) {
  return SOURCE_KINDS.includes(String(kind));
}
