// Filters backing the speaking index and the individual talk pages. Both views
// read the same talk front matter through these helpers, so a card and its page
// can never disagree about a talk's type, topics, or links.

// Topic taxonomy in priority order. The first rule a talk matches is its
// primary topic and drives the accent color on cards and pages. Matching runs
// against the title first; only talks whose title names no topic fall back to
// the abstract, which keeps tagging precise while still covering every talk.
export const TOPIC_RULES = [
  {
    slug: "https-tls",
    label: "HTTPS & TLS",
    re: /https|tls|\bssl\b|put an .s. on it/i,
  },
  { slug: "http2", label: "HTTP/2", re: /http\s*\/?\s*2\b/i },
  { slug: "caching", label: "Caching", re: /cach/i },
  { slug: "git", label: "Git", re: /\bgit\b/i },
  {
    slug: "performance",
    label: "Performance",
    re: /performanc|speed|\bfast\b|page[ -]?load/i,
  },
  {
    slug: "javascript",
    label: "JavaScript",
    re: /backbone|\bnode\b|react|javascript|ecmascript/i,
  },
  {
    slug: "infrastructure",
    label: "Infrastructure",
    re: /infrastructure|cowboy|stack|scal|\bedge\b/i,
  },
  {
    slug: "wordpress",
    label: "WordPress",
    re: /wordpress|object cache|theme|core function|function for that|partial page|templat|doing.it.wrong/i,
  },
];

// Display labels for the event types used in talk front matter. Unknown values
// fall back to the raw slug so a new event still renders a usable chip.
export const EVENT_LABELS = {
  wordcamp: "WordCamp",
  phpworld: "php[world]",
  loopconf: "LoopConf",
  midwestphp: "MidwestPHP",
  velocity: "Velocity",
  altitude: "Fastly Altitude",
  xbiz: "XBIZ",
  meetup: "Meetup",
  wpsessions: "WPSessions",
  other: "Other",
};

// Topics for one talk, as { slug, label } in taxonomy order.
export function talkTopics(data) {
  if (!data) {
    return [];
  }
  const title = String(data.title || "");
  const byTitle = TOPIC_RULES.filter(rule => rule.re.test(title));
  const matched = byTitle.length
    ? byTitle
    : TOPIC_RULES.filter(rule =>
        rule.re.test(`${title} ${data.description || ""}`)
      );
  return matched.map(({ slug, label }) => ({ slug, label }));
}

// Engagement format, shown as a badge on anything that is not a plain talk.
export function talkType(title) {
  const text = String(title || "");
  if (/keynote/i.test(text)) {
    return { slug: "keynote", label: "Keynote" };
  }
  if (/\bpanel\b/i.test(text)) {
    return { slug: "panel", label: "Panel" };
  }
  if (/workshop/i.test(text)) {
    return { slug: "workshop", label: "Workshop" };
  }
  return { slug: "talk", label: "Talk" };
}

// Drop the type marker from the visible title; it is shown as a badge instead.
export function displayTitle(title) {
  return String(title || "")
    .replace(/\s*\((?:keynote|workshop|panel)\)\s*$/i, "")
    .replace(/^\s*(?:keynote|workshop|panel)\s*:\s*/i, "")
    .trim();
}

// Collapse a title to a comparison key so the same talk given at several
// events is recognized as one series when ranking related talks.
export function seriesKey(title) {
  return displayTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function videoProvider(url) {
  const value = String(url || "");
  if (/wordpress\.tv/i.test(value)) {
    return "WordPress.tv";
  }
  if (/youtube\.com|youtu\.be/i.test(value)) {
    return "YouTube";
  }
  if (/vimeo\.com/i.test(value)) {
    return "Vimeo";
  }
  if (/oreilly\.com/i.test(value)) {
    return "O'Reilly";
  }
  return "Video";
}

// True for decks hosted on this site, which are linked as downloads.
export function isLocalPdf(url) {
  return /^\/.*\.pdf$/i.test(String(url || ""));
}

export function slidesProvider(url) {
  const value = String(url || "");
  if (/speakerdeck\.com/i.test(value)) {
    return "Speaker Deck";
  }
  if (isLocalPdf(value)) {
    return "PDF";
  }
  if (/github\.io|github\.com/i.test(value)) {
    return "GitHub";
  }
  return "Slides";
}

// Split the free-form sources list into the sections the talk page renders:
// code repos, on-site reading, and external coverage.
export function categorizeSources(sources) {
  const code = [];
  const reading = [];
  const elsewhere = [];
  for (const source of sources || []) {
    if (!source || !source.url) {
      continue;
    }
    if (source.label === "Code" || /github\.com/i.test(source.url)) {
      code.push(source);
    } else if (source.url.startsWith("/")) {
      reading.push(source);
    } else {
      elsewhere.push(source);
    }
  }
  return { code, reading, elsewhere };
}

// Topic filter facets: { slug, label, count } in taxonomy order, counting every
// talk that carries each topic. Topics nobody speaks about are omitted.
export function topicFacets(talks) {
  const counts = new Map();
  for (const talk of talks || []) {
    for (const topic of talkTopics(talk?.data)) {
      const facet = counts.get(topic.slug) || { ...topic, count: 0 };
      facet.count += 1;
      counts.set(topic.slug, facet);
    }
  }
  return TOPIC_RULES.map(rule => counts.get(rule.slug)).filter(Boolean);
}

// Event filter facets, ordered by count and then label so the busiest event
// series leads the chip row.
export function eventFacets(talks) {
  const counts = new Map();
  for (const talk of talks || []) {
    const slug = talk?.data?.eventType || "other";
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  return [...counts]
    .map(([slug, count]) => ({
      slug,
      label: EVENT_LABELS[slug] || slug,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
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
    withVideo: items.filter(talk => talk?.data?.video).length,
    withSlides: items.filter(talk => talk?.data?.slides).length,
  };
}

// Rank related talks: the same talk given at another event scores highest, then
// talks that share the most topics. Returns up to `limit` collection items,
// newest first within a score. The current talk is identified by inputPath.
export function relatedTalks(talks, inputPath, limit) {
  const items = talks || [];
  const max = limit || 4;
  const current = items.find(talk => talk.inputPath === inputPath);
  if (!current) {
    return [];
  }
  const currentTopics = talkTopics(current.data).map(topic => topic.slug);
  const currentSeries = seriesKey(current.data.title);
  return items
    .filter(talk => talk.inputPath !== inputPath)
    .map(talk => {
      const shared = talkTopics(talk.data).filter(topic =>
        currentTopics.includes(topic.slug)
      ).length;
      const sameSeries = seriesKey(talk.data.title) === currentSeries ? 1 : 0;
      return { talk, score: sameSeries * 100 + shared };
    })
    .filter(scored => scored.score > 0)
    .sort((a, b) => b.score - a.score || b.talk.date - a.talk.date)
    .slice(0, max)
    .map(scored => scored.talk);
}
