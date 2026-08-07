import * as pulumi from "@pulumi/pulumi";
import * as honeycombio from "@pulumi/honeycombio";

// Provider authentication comes from the environment, never from committed
// config: the gitignored repo-root .env locally, GitHub Actions secrets in CI.
// The bridged Honeycomb provider reads the v2 Management Key pair from
// HONEYCOMB_KEY_ID and HONEYCOMB_KEY_SECRET. Fail fast if either is missing so
// the error is obvious.
for (const name of ["HONEYCOMB_KEY_ID", "HONEYCOMB_KEY_SECRET"]) {
  if (!process.env[name]) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in the repo-root .env locally or as a GitHub Actions secret in CI.`
    );
  }
}

const config = new pulumi.Config();
const environmentName = config.get("environmentName") ?? "tollmanz-com";
const localEnvironmentName =
  config.get("localEnvironmentName") ?? "tollmanz-com-local";

// Whether to manage the RUM boards (see the v1 board tier below). Gated on
// committed flags, not on env-var presence, so board state is deterministic
// across every apply context. The dataset is created on ingest and named by the
// browser SDK's serviceName (see assets/rum/index.js, scripts/build-rum.mjs); it
// carries the same name in both environments, scoped per environment by the
// config key each board provider authenticates with.
const manageProdBoard = config.getBoolean("manageProdBoard") ?? false;
const manageLocalBoard = config.getBoolean("manageLocalBoard") ?? false;
const datasetName = config.get("datasetName") ?? "tollmanz-com-web";

// Production Honeycomb environment that holds browser RUM telemetry. In the
// Environments and Services model datasets are created on ingest, so none is
// declared here; the ingest key below creates it on the first telemetry it
// receives.
const environment = new honeycombio.Environment("rum", {
  name: environmentName,
  description: "tollmanz.com browser RUM (OpenTelemetry)",
  color: "blue",
});

// Ingest key the Fastly edge proxy injects as the x-honeycomb-team header. It is
// write-only and never reaches the browser. createDatasets lets the first
// telemetry create the dataset named by the browser SDK's serviceName.
const ingest = new honeycombio.ApiKey("rum-ingest", {
  name: "tollmanz-com RUM ingest",
  type: "ingest",
  environmentId: environment.id,
  permissions: [{ createDatasets: true }],
});

// A separate environment for local RUM testing, isolated from prod so local
// runs never taint production data. Its ingest key is exported below; read it
// with `pulumi stack output localIngestKey --show-secrets` and paste it into
// HONEYCOMB_LOCAL_INGEST_KEY in the repo-root .env, where the local collector
// uses it to forward browser RUM here (see local/otel/README.md).
const localEnvironment = new honeycombio.Environment("rum-local", {
  name: localEnvironmentName,
  description: "tollmanz.com browser RUM, local testing only",
  color: "green",
});

const localIngest = new honeycombio.ApiKey("rum-local-ingest", {
  name: "tollmanz-com RUM ingest (local)",
  type: "ingest",
  environmentId: localEnvironment.id,
  permissions: [{ createDatasets: true }],
});

// v1 board tier (see issue #59).
//
// Boards, queries, and query annotations are Honeycomb v1 API resources. They
// need a v1 Configuration Key scoped to a single environment, not the v2
// Management Key the provider above authenticates with. Minting a configuration
// key from the Management Key fails on this plan ("access to this API is
// disabled: Error Creating Honeycomb API Key"), so each key is created by hand
// in the Honeycomb UI (Environment settings -> API Keys) and supplied out of
// band via an env var rather than by a honeycombio.ApiKey resource.
//
// Enablement is gated on committed flags, not on env-var presence, so state is
// deterministic across apply contexts: with one shared stack, keying on env-var
// presence would let a local apply create a board and a CI apply without the key
// delete it. Flip a flag only once its config key exists both in the repo-root
// .env and as the matching GitHub Actions secret. See infra/honeycomb/README.md.

// Core Web Vitals tracked on every board. WebVitalsInstrumentation emits each
// metric as its own span carrying a `<metric>.value` field; p75 is the value
// Google reports for Core Web Vitals.
const vitals = [
  {
    key: "lcp",
    label: "LCP p75",
    description: "Largest Contentful Paint, 75th percentile (ms)",
  },
  {
    key: "inp",
    label: "INP p75",
    description: "Interaction to Next Paint, 75th percentile (ms)",
  },
  {
    key: "cls",
    label: "CLS p75",
    description: "Cumulative Layout Shift, 75th percentile",
  },
  {
    key: "fcp",
    label: "FCP p75",
    description: "First Contentful Paint, 75th percentile (ms)",
  },
  {
    key: "ttfb",
    label: "TTFB p75",
    description: "Time to First Byte, 75th percentile (ms)",
  },
];

// The RUM overview section, ported from the hand-made `Real User Monitoring
// (RUM)` board that Honeycomb's template created in both environments. Each
// entry reproduces that board's saved query as a managed resource rather than
// pointing at the UI-owned query by ID, so the whole board is code and nothing
// breaks if the hand-made board is retired.
//
// These queries are environment-wide in the template (`__all__`); here they are
// scoped to the one dataset the environment has, matching the vitals section.
// Every column they reference exists in both environments. `position` preserves
// the template's own arrangement, offset below the vitals section.
//
// They all use a 7200s (two hour) window at 10s granularity, as the template
// did. That is deliberately shorter than the vitals section's 7 day p75, so the
// two sections answer different questions: what is happening now, and what the
// steady-state user experience looks like.
const overview = [
  {
    key: "lcp-ratings",
    label: "Largest Contentful Paint (LCP)",
    description:
      "Ratings based on the render time for the largest content on a page",
    style: "combo",
    position: { x: 0, y: 0, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["lcp.rating", "name"],
      calculations: [{ op: "COUNT" }],
      filters: [{ column: "name", op: "in", value: ["LCP", "lcp"] }],
      orders: [{ op: "COUNT", order: "descending" }],
      time_range: 7200,
    },
  },
  {
    key: "cls-ratings",
    label: "Cumulative Layout Shift (CLS)",
    description: "Ratings based on the stability of content layout on a page",
    style: "combo",
    position: { x: 4, y: 0, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["cls.rating", "name"],
      calculations: [{ op: "COUNT" }],
      filters: [{ column: "name", op: "in", value: ["CLS", "cls"] }],
      orders: [{ op: "COUNT", order: "descending" }],
      time_range: 7200,
    },
  },
  {
    key: "lcp-p75",
    label: "Largest Contentful Paint P75",
    description: "The 75th percentile for LCP",
    style: "graph",
    position: { x: 8, y: 0, width: 4, height: 4 },
    query: {
      granularity: 10,
      calculations: [{ column: "lcp.value", op: "P75" }],
      filters: [{ column: "name", op: "in", value: ["LCP", "lcp"] }],
      orders: [{ column: "lcp.value", op: "P75", order: "descending" }],
      time_range: 7200,
    },
  },
  {
    key: "cls-p75",
    label: "Cumulative Layout Shift P75",
    description: "The 75th percentile for CLS",
    style: "graph",
    position: { x: 0, y: 8, width: 4, height: 4 },
    query: {
      granularity: 10,
      calculations: [{ column: "cls.value", op: "P75" }],
      filters: [{ column: "name", op: "in", value: ["CLS", "cls"] }],
      orders: [{ column: "cls.value", op: "P75", order: "descending" }],
      time_range: 7200,
    },
  },
  {
    key: "events-by-type",
    label: "Total Events by Type",
    description: "Event types ranked by occurrence",
    style: "combo",
    position: { x: 4, y: 8, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["name"],
      calculations: [{ op: "COUNT" }],
      filters: [
        { column: "meta.annotation_type", op: "!=", value: "span_event" },
      ],
      orders: [{ op: "COUNT", order: "descending" }],
      limit: 100,
      time_range: 7200,
    },
  },
  {
    key: "largest-resources",
    label: "Largest Resource Requests",
    description:
      "The largest resource requests ranked by the average length of their response content",
    style: "table",
    position: { x: 8, y: 8, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["http.url"],
      calculations: [{ column: "http.response_content_length", op: "AVG" }],
      filters: [
        { column: "http.response_content_length", op: "exists" },
        { column: "name", op: "=", value: "resourceFetch" },
      ],
      orders: [
        {
          column: "http.response_content_length",
          op: "AVG",
          order: "descending",
        },
      ],
      limit: 100,
      time_range: 7200,
    },
  },
  {
    // Retargeted from the template's version, which filtered `name` to fetch and
    // XHR span names (`HTTP GET` and friends). This site issues no fetch or XHR
    // calls, and the RUM exporter's own request is excluded from instrumentation
    // (see assets/rum/index.js), so that filter matched nothing and the panel was
    // always empty. The navigation request is a `documentFetch` span, which is
    // what "slowest request" means here.
    key: "slowest-endpoints",
    label: "Slowest Pages by Document Fetch",
    description:
      "Routes ranked by the 75th percentile of their navigation request duration",
    style: "table",
    position: { x: 0, y: 16, width: 4, height: 8 },
    query: {
      breakdowns: ["page.route"],
      calculations: [{ column: "duration_ms", op: "P75" }],
      filters: [{ column: "name", op: "=", value: "documentFetch" }],
      orders: [{ column: "duration_ms", op: "P75", order: "descending" }],
      limit: 100,
      time_range: 7200,
    },
  },
  {
    key: "top-landing-pages",
    // Counting document loads, not visits. The Honeycomb web SDK mints its
    // session id once per document (`sessionId` is module scoped with no
    // storage), so on this multi-page site every navigation starts a new session
    // and `entry_page.path` is just the path that was loaded. COUNT_DISTINCT over
    // `session.id` would return the same number under a name that implies
    // otherwise, so the label says page load instead.
    label: "Top Landing Pages by Page Load",
    description:
      "Landing pages ranked by document load count. Each navigation is its own session here, so this counts page loads rather than distinct visits",
    style: "table",
    position: { x: 4, y: 16, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["entry_page.path"],
      calculations: [{ op: "COUNT" }],
      filters: [
        { column: "entry_page.path", op: "exists" },
        { column: "name", op: "=", value: "documentLoad" },
      ],
      orders: [{ op: "COUNT", order: "descending" }],
      limit: 100,
      time_range: 7200,
    },
  },
  {
    key: "busiest-pages",
    label: "Pages With the Most Events",
    description:
      "Pages with the highest number of events, highlighting the most active pages",
    style: "table",
    position: { x: 8, y: 16, width: 4, height: 8 },
    query: {
      granularity: 10,
      breakdowns: ["page.route"],
      calculations: [{ op: "COUNT" }],
      filters: [{ column: "page.route", op: "exists" }],
      orders: [{ op: "COUNT", order: "descending" }],
      limit: 100,
      time_range: 7200,
    },
  },
];

// ---------------------------------------------------------------------------
// Core Web Vitals triage board (a second board, alongside the RUM one above)
// ---------------------------------------------------------------------------
//
// The RUM board answers "what are the numbers". This one answers "which pages
// miss a threshold, and why". Four facts about the shape of this telemetry
// drive its design; all four were verified against the built bundle running in
// headless Chromium and against the live prod schema.
//
// 1. Every web vital is its own single-span trace. WebVitalsInstrumentation
//    calls `tracer.startSpan` with no parent when the metric finalizes, which
//    is long after documentLoad ended, so LCP, CLS, INP, FCP and TTFB each land
//    as a root span in their own trace. One page view is therefore scattered
//    across roughly six traces and no trace waterfall shows the whole thing.
//
// 2. `session.id` is the join key that stitches them back together. The SDK
//    mints it once per document with no persistence, so on this multi-page
//    static site one session id is exactly one page view. It is stamped on
//    every span, in every one of those traces. That is what makes the drill-down
//    section work.
//
// 3. `page.route` is also on every span, added by the SDK's
//    BrowserAttributesSpanProcessor on span start. Vitals can therefore be
//    broken down per page, which is the whole basis of the offender tables.
//
// 4. Resource attributes (`device.type`, `network.effectiveType`,
//    `browser.name`, `screen.size`, `entry_page.*`) are flattened onto every
//    event by Honeycomb, so they segment vitals for free.
//
// The one thing that does not compose: `fastly.*` lives only on `documentFetch`
// spans, and `ttfb.*` only on `TTFB` spans. Honeycomb has no join, and these
// are different spans in different traces, so edge cache outcome cannot be
// broken down by TTFB in a single query. The delivery section keeps them as
// neighbouring panels and says so.
//
// Filters use `<metric>.rating` rather than a hand-written millisecond
// threshold. The SDK computes the rating in the browser from Google's official
// good/needs-improvement/poor boundaries, so the thresholds cannot drift out of
// sync here. It also sidesteps a data bug: `cls.value` was an integer column in
// prod for a while and truncated every score to zero, but `cls.rating` was
// computed client-side from the true float and is correct across that period.

// Seven days, matching the window Google reports Core Web Vitals over and the
// vitals section of the RUM board.
const TRIAGE_WINDOW = 604800;
// Hourly buckets over that window, for the panels that show a trend.
const TRIAGE_GRANULARITY = 3600;

// The spans for one metric. Span names are emitted uppercase; the lowercase
// alternate matches what the RUM board's ported queries already allow for.
const vitalSpans = (metric: string) => ({
  column: "name",
  op: "in",
  value: [metric.toUpperCase(), metric],
});

// Views that miss the threshold: everything Google does not call "good", so
// needs-improvement is included rather than waiting for outright failure.
const missesThreshold = (metric: string) => ({
  column: `${metric}.rating`,
  op: "!=",
  value: "good",
});

const documentFetchSpans = {
  column: "name",
  op: "=",
  value: "documentFetch",
};

// Vitals panels count page views, not spans. Every web vital reports at most
// once per page view, and one `session.id` is one page view (see note 2 above),
// so COUNT_DISTINCT over it is the honest number for a panel whose label says
// "views". Plain COUNT would also read high for any window reaching back before
// 2026-08-07: the bundle registered WebVitalsInstrumentation twice until then
// and emitted every vital as two identical spans, so a span count reports twice
// the real traffic. COUNT_DISTINCT is immune to that, which keeps these panels
// comparable across the fix instead of showing a phantom 50% drop on the day it
// shipped.
const PAGE_VIEWS = { op: "COUNT_DISTINCT", column: "session.id" };
const BY_VIEWS = [
  { column: "session.id", op: "COUNT_DISTINCT", order: "descending" },
];

// documentFetch spans are one per navigation and were never duplicated, so on
// the delivery panels a plain span count is exactly the request count.
const BY_COUNT = [{ op: "COUNT", order: "descending" }];

interface TriagePanel {
  key: string;
  label: string;
  description: string;
  style: string;
  position: { x: number; y: number; width: number; height: number };
  query: Record<string, unknown>;
}

interface TriageSection {
  heading: string;
  panels: TriagePanel[];
}

// One offender table per metric: the routes serving views that miss the
// threshold, ranked by how many. This is the "where do I start" panel.
const offenders = (metric: string, label: string, x: number): TriagePanel => ({
  key: `${metric}-offenders`,
  label: `${label}: pages missing the threshold`,
  description: `Routes ranked by how many page views rated needs-improvement or poor for ${label}, with the 75th percentile ${label} on those views`,
  style: "table",
  position: { x, y: 0, width: 4, height: 6 },
  query: {
    breakdowns: ["page.route"],
    calculations: [PAGE_VIEWS, { op: "P75", column: `${metric}.value` }],
    filters: [vitalSpans(metric), missesThreshold(metric)],
    orders: BY_VIEWS,
    limit: 100,
    time_range: TRIAGE_WINDOW,
  },
});

// The good/needs-improvement/poor split over time, so a regression shows up as
// a change in mix rather than only as a percentile drift.
const ratingMix = (metric: string, label: string, x: number): TriagePanel => ({
  key: `${metric}-rating-mix`,
  label: `${label}: rating mix`,
  description: `Page views by ${label} rating over time, hourly`,
  style: "combo",
  position: { x, y: 6, width: 4, height: 5 },
  query: {
    granularity: TRIAGE_GRANULARITY,
    breakdowns: [`${metric}.rating`],
    calculations: [PAGE_VIEWS],
    filters: [vitalSpans(metric)],
    orders: BY_VIEWS,
    time_range: TRIAGE_WINDOW,
  },
});

// Segment failing views by an audience dimension. Every calculation is scoped
// to vitals spans, and each P75 only sees the spans that carry that column, so
// one query reports all four metrics per segment.
const segment = (
  key: string,
  column: string,
  label: string,
  x: number
): TriagePanel => ({
  key: `by-${key}`,
  label: `Vitals by ${label}`,
  description: `p75 of each Core Web Vital, split by ${label}`,
  style: "table",
  position: { x, y: 0, width: 4, height: 5 },
  query: {
    breakdowns: [column],
    calculations: [
      PAGE_VIEWS,
      { op: "P75", column: "lcp.value" },
      { op: "P75", column: "cls.value" },
      { op: "P75", column: "inp.value" },
      { op: "P75", column: "ttfb.value" },
    ],
    filters: [
      {
        column: "name",
        op: "in",
        value: ["LCP", "CLS", "INP", "TTFB", "FCP"],
      },
    ],
    orders: BY_VIEWS,
    limit: 100,
    time_range: TRIAGE_WINDOW,
  },
});

// The worst individual page views for one metric. `session.id` is the page view
// (see note 2 above), so each row is one visitor's load and the id is what you
// filter on to pull up every span that page view produced.
const worstViews = (metric: string, label: string, x: number): TriagePanel => ({
  key: `worst-${metric}-views`,
  label: `Worst page views by ${label}`,
  description: `Individual page views that missed the ${label} threshold, worst first. Filter the dataset on a session.id from this table to see every span that page view produced`,
  style: "table",
  position: { x, y: 0, width: 4, height: 8 },
  query: {
    breakdowns: ["session.id", "page.route"],
    calculations: [{ op: "MAX", column: `${metric}.value` }],
    filters: [vitalSpans(metric), missesThreshold(metric)],
    orders: [{ column: `${metric}.value`, op: "MAX", order: "descending" }],
    limit: 50,
    time_range: TRIAGE_WINDOW,
  },
});

const triage: TriageSection[] = [
  {
    heading:
      "## 1. Which pages miss a threshold\n\n" +
      "Seven days. A view counts as missing when the browser rated it anything other than `good`: " +
      "LCP over 2.5s, INP over 200ms, CLS over 0.1. Start with the route at the top of a table, " +
      "then read the matching section below for why.",
    panels: [
      offenders("lcp", "LCP", 0),
      offenders("cls", "CLS", 4),
      offenders("inp", "INP", 8),
      ratingMix("lcp", "LCP", 0),
      ratingMix("cls", "CLS", 4),
      ratingMix("inp", "INP", 8),
    ],
  },
  {
    heading:
      "## 2. Why LCP misses\n\n" +
      "LCP decomposes into four consecutive phases that sum to the metric: time to first byte, " +
      "then the delay before the browser discovers the LCP resource, then downloading it, then " +
      "rendering it. Whichever column dominates is the thing to fix, and each points somewhere " +
      "different: TTFB at the edge or origin, resource load delay at markup and discovery order, " +
      "load duration at the asset itself, render delay at blocking CSS or JavaScript. " +
      "`lcp.element` names the actual DOM node the browser measured.",
    panels: [
      {
        key: "lcp-phases",
        label: "LCP phase breakdown on failing views",
        description:
          "For views that missed the LCP threshold, p75 of each LCP phase per route. The four phases sum to LCP, so the largest column is the bottleneck",
        style: "table",
        position: { x: 0, y: 0, width: 8, height: 6 },
        query: {
          breakdowns: ["page.route"],
          calculations: [
            PAGE_VIEWS,
            { op: "P75", column: "lcp.value" },
            { op: "P75", column: "lcp.time_to_first_byte" },
            { op: "P75", column: "lcp.resource_load_delay" },
            { op: "P75", column: "lcp.resource_load_duration" },
            { op: "P75", column: "lcp.element_render_delay" },
          ],
          filters: [vitalSpans("lcp"), missesThreshold("lcp")],
          orders: BY_VIEWS,
          limit: 100,
          time_range: TRIAGE_WINDOW,
        },
      },
      {
        key: "lcp-elements",
        label: "Which element is the LCP element",
        description:
          "The DOM element the browser measured as largest contentful paint on views that missed the threshold",
        style: "table",
        position: { x: 8, y: 0, width: 4, height: 6 },
        query: {
          breakdowns: ["lcp.element"],
          calculations: [PAGE_VIEWS, { op: "P75", column: "lcp.value" }],
          filters: [vitalSpans("lcp"), missesThreshold("lcp")],
          orders: BY_VIEWS,
          limit: 100,
          time_range: TRIAGE_WINDOW,
        },
      },
      {
        key: "lcp-phase-trend",
        label: "LCP phases over time",
        description:
          "p75 of each LCP phase across all views, hourly. Shows which phase moved when LCP regresses",
        style: "graph",
        position: { x: 0, y: 6, width: 12, height: 4 },
        query: {
          granularity: TRIAGE_GRANULARITY,
          calculations: [
            { op: "P75", column: "lcp.time_to_first_byte" },
            { op: "P75", column: "lcp.resource_load_delay" },
            { op: "P75", column: "lcp.resource_load_duration" },
            { op: "P75", column: "lcp.element_render_delay" },
          ],
          filters: [vitalSpans("lcp")],
          time_range: TRIAGE_WINDOW,
        },
      },
    ],
  },
  {
    heading:
      "## 3. Why CLS misses\n\n" +
      "`cls.largest_shift_target` is the CSS selector of the element whose movement contributed " +
      "the most to the score, which usually names the fix outright: an image without dimensions, " +
      "a late-loading font, an injected banner. `cls.load_state` says whether the shift happened " +
      "while the page was still loading or after it settled.",
    panels: [
      {
        key: "cls-shift-targets",
        label: "Elements causing the layout shift",
        description:
          "The element responsible for the largest layout shift on views that missed the CLS threshold, ranked by how many page views it affected",
        style: "table",
        position: { x: 0, y: 0, width: 8, height: 6 },
        query: {
          breakdowns: ["cls.largest_shift_target"],
          calculations: [
            PAGE_VIEWS,
            { op: "P75", column: "cls.value" },
            { op: "MAX", column: "cls.largest_shift_value" },
          ],
          filters: [vitalSpans("cls"), missesThreshold("cls")],
          orders: BY_VIEWS,
          limit: 100,
          time_range: TRIAGE_WINDOW,
        },
      },
      {
        key: "cls-load-state",
        label: "When the shift happens",
        description:
          "Page lifecycle state at the moment of the largest shift, on views that missed the CLS threshold",
        style: "table",
        position: { x: 8, y: 0, width: 4, height: 6 },
        query: {
          breakdowns: ["cls.load_state"],
          calculations: [PAGE_VIEWS, { op: "P75", column: "cls.value" }],
          filters: [vitalSpans("cls"), missesThreshold("cls")],
          orders: BY_VIEWS,
          limit: 100,
          time_range: TRIAGE_WINDOW,
        },
      },
    ],
  },
  {
    heading:
      "## 4. Why INP misses\n\n" +
      "INP is the sum of three phases: input delay while the main thread is busy before the " +
      "handler runs, processing duration inside the handler, and presentation delay before the " +
      "next frame paints. A large input delay means something else was blocking; a large " +
      "processing duration means the handler itself is slow. `inp.element` and `inp.event_type` " +
      "identify the interaction.",
    panels: [
      {
        key: "inp-phases",
        label: "INP phase breakdown on failing views",
        description:
          "For views that missed the INP threshold, p75 of each INP phase per route. The three phases sum to INP",
        style: "table",
        position: { x: 0, y: 0, width: 8, height: 6 },
        query: {
          breakdowns: ["page.route"],
          calculations: [
            PAGE_VIEWS,
            { op: "P75", column: "inp.value" },
            { op: "P75", column: "inp.input_delay" },
            { op: "P75", column: "inp.processing_duration" },
            { op: "P75", column: "inp.presentation_delay" },
          ],
          filters: [vitalSpans("inp"), missesThreshold("inp")],
          orders: BY_VIEWS,
          limit: 100,
          time_range: TRIAGE_WINDOW,
        },
      },
      {
        key: "inp-interactions",
        label: "Which interactions are slow",
        description:
          "The element and event type behind interactions that missed the INP threshold",
        style: "table",
        position: { x: 8, y: 0, width: 4, height: 6 },
        query: {
          breakdowns: ["inp.element", "inp.event_type"],
          calculations: [PAGE_VIEWS, { op: "P75", column: "inp.value" }],
          filters: [vitalSpans("inp"), missesThreshold("inp")],
          orders: BY_VIEWS,
          limit: 100,
          time_range: TRIAGE_WINDOW,
        },
      },
    ],
  },
  {
    heading:
      "## 5. Server time and edge delivery\n\n" +
      "TTFB is the floor under LCP: no page can paint before its first byte arrives. The left " +
      "panel decomposes TTFB as the browser measured it. The right two come from the Fastly " +
      "Server-Timing header on the `documentFetch` span, which is a different span in a " +
      "different trace, so Honeycomb cannot break one down by the other. Read them side by " +
      "side: a route with poor TTFB and a `MISS` or `SHIELD_HIT` cache status is an edge caching " +
      "problem, not an application one. `fastly.backend_ms` is absent whenever the edge answered " +
      "from its own cache, which is the honest signal that no backend work happened.",
    panels: [
      {
        key: "ttfb-phases",
        label: "TTFB phase breakdown by route",
        description:
          "p75 of each phase the browser attributes time to before the first byte: DNS, connection, request, and waiting",
        style: "table",
        position: { x: 0, y: 0, width: 6, height: 6 },
        query: {
          breakdowns: ["page.route"],
          calculations: [
            PAGE_VIEWS,
            { op: "P75", column: "ttfb.value" },
            { op: "P75", column: "ttfb.dns_duration" },
            { op: "P75", column: "ttfb.connection_duration" },
            { op: "P75", column: "ttfb.request_duration" },
            { op: "P75", column: "ttfb.waiting_duration" },
          ],
          filters: [vitalSpans("ttfb")],
          orders: [{ column: "ttfb.value", op: "P75", order: "descending" }],
          limit: 100,
          time_range: TRIAGE_WINDOW,
        },
      },
      {
        key: "edge-cache-status",
        label: "Navigation time by edge cache outcome",
        description:
          "How deep into the stack the navigation request went, and what it cost. Measured on the documentFetch span from the Fastly Server-Timing header",
        style: "table",
        position: { x: 6, y: 0, width: 6, height: 6 },
        query: {
          breakdowns: ["fastly.cache_status"],
          calculations: [
            { op: "COUNT" },
            { op: "P75", column: "duration_ms" },
            { op: "P75", column: "fastly.total_ms" },
            { op: "P75", column: "fastly.backend_ms" },
          ],
          filters: [documentFetchSpans],
          orders: BY_COUNT,
          limit: 100,
          time_range: TRIAGE_WINDOW,
        },
      },
      {
        key: "edge-pop",
        label: "Navigation time by Fastly POP",
        description:
          "Navigation request duration per customer-facing POP, slowest first. Isolates a regional edge problem from a site-wide one",
        style: "table",
        position: { x: 0, y: 6, width: 12, height: 5 },
        query: {
          breakdowns: ["fastly.pop", "fastly.region"],
          calculations: [
            { op: "COUNT" },
            { op: "P75", column: "duration_ms" },
            { op: "P75", column: "fastly.total_ms" },
          ],
          filters: [documentFetchSpans],
          orders: [{ column: "duration_ms", op: "P75", order: "descending" }],
          limit: 100,
          time_range: TRIAGE_WINDOW,
        },
      },
    ],
  },
  {
    heading:
      "## 6. Who is affected\n\n" +
      "The same vitals split by audience, from resource attributes Honeycomb flattens onto every " +
      "event. A metric that only misses on `mobile`, on `3g`, or in one browser is a different " +
      "problem from one that misses everywhere, and it changes what is worth fixing.",
    panels: [
      segment("device", "device.type", "device type", 0),
      segment("network", "network.effectiveType", "network type", 4),
      segment("browser", "browser.name", "browser", 8),
    ],
  },
  {
    heading:
      "## 7. Drill into one page view\n\n" +
      "Each web vital finalizes long after `documentLoad` ended, so the SDK emits it as a root " +
      "span in its own trace. One page view is therefore spread across about six traces and no " +
      "single waterfall contains all of it. `session.id` is what puts it back together: the SDK " +
      "mints one per document, so on this site one session id is exactly one page view, and it " +
      "is stamped on every span in every one of those traces.\n\n" +
      "**To investigate a bad view:** pick a `session.id` from a table below, then run " +
      "`session.id = <that id>` over the dataset with no breakdown. That returns every span the " +
      "page view produced, the vitals and the load waterfall together, with each vital's full " +
      "attribution attached. The left panel is different: those rows are `documentLoad` spans, " +
      "so opening one goes straight to a real trace waterfall of the navigation and its " +
      "subresources.",
    panels: [
      {
        key: "slowest-page-loads",
        label: "Slowest page loads (opens a trace)",
        description:
          "Individual documentLoad spans, slowest first. These are real traces: open one for the navigation and subresource waterfall",
        style: "table",
        position: { x: 0, y: 0, width: 4, height: 8 },
        query: {
          breakdowns: ["session.id", "page.route"],
          calculations: [{ op: "MAX", column: "duration_ms" }],
          filters: [{ column: "name", op: "=", value: "documentLoad" }],
          orders: [{ column: "duration_ms", op: "MAX", order: "descending" }],
          limit: 50,
          time_range: TRIAGE_WINDOW,
        },
      },
      worstViews("lcp", "LCP", 4),
      worstViews("cls", "CLS", 8),
    ],
  },
];

// Honeycomb lays boards out on a 12 column grid. The vitals sit three to a row
// under their heading, then the ported overview section starts below them, so
// each section reads as its own block.
const GRID_COLUMNS = 12;
const HEADING_HEIGHT = 2;
const VITAL_WIDTH = 4;
const VITAL_HEIGHT = 4;
const VITALS_PER_ROW = GRID_COLUMNS / VITAL_WIDTH;
const VITALS_ORIGIN_Y = HEADING_HEIGHT;
const OVERVIEW_HEADING_Y =
  VITALS_ORIGIN_Y + Math.ceil(vitals.length / VITALS_PER_ROW) * VITAL_HEIGHT;
const OVERVIEW_ORIGIN_Y = OVERVIEW_HEADING_Y + HEADING_HEIGHT;

// The boards one environment gets. Every environment gets the RUM board; only
// an environment whose dataset carries the full attribution schema gets the
// triage board, so `triageBoardId` is absent for the local environment.
interface EnvironmentBoards {
  rumBoardId: pulumi.Output<string>;
  triageBoardId?: pulumi.Output<string>;
}

// Build both curated boards for one environment, authenticated with that
// environment's v1 Configuration Key. `slug` (prod/local) keeps resource names
// unique across the two environments. One provider serves both boards.
//
// `Real User Monitoring (RUM)` is now the only RUM board in each environment.
// The hand-made template board that Honeycomb created, also called `Real User
// Monitoring (RUM)`, was deleted once its panels were reproduced in the overview
// section below, so the name is free and there is one board per environment
// rather than two similar ones.
//
// `Core Web Vitals triage` is the second board, built from the `triage` sections
// above. It is separate rather than another section on the RUM board because it
// answers a different question and is read at a different time: the RUM board
// is the standing view, this one is opened when a vital regresses.
function rumBoard(
  slug: string,
  configKey: string,
  description: string,
  // Omit to skip the Core Web Vitals triage board for this environment.
  triageDescription?: string
): EnvironmentBoards {
  const provider = new honeycombio.Provider(`rum-${slug}-config`, {
    apiKey: configKey,
  });
  const providerOpts = { provider };

  // A query panel and the two resources behind it. `name` is the Pulumi resource
  // name and must stay stable: the vitals panels were created as
  // `rum-<slug>-<key>` before the overview section existed, and changing those
  // names would replace live queries.
  const queryPanel = (
    name: string,
    queryJson: object,
    label: string,
    caption: string,
    style: string,
    position: { x: number; y: number; width: number; height: number }
  ) => {
    const query = new honeycombio.Query(
      name,
      { dataset: datasetName, queryJson: JSON.stringify(queryJson) },
      providerOpts
    );
    const annotation = new honeycombio.QueryAnnotation(
      name,
      {
        dataset: datasetName,
        queryId: query.id,
        name: label,
        description: caption,
      },
      providerOpts
    );
    return {
      type: "query",
      position: {
        xCoordinate: position.x,
        yCoordinate: position.y,
        width: position.width,
        height: position.height,
      },
      queryPanels: [
        {
          queryId: query.id,
          queryAnnotationId: annotation.id,
          queryStyle: style,
        },
      ],
    };
  };

  // Full-width Markdown panel that titles a section.
  const heading = (yCoordinate: number, content: string) => ({
    type: "text",
    position: {
      xCoordinate: 0,
      yCoordinate,
      width: GRID_COLUMNS,
      height: HEADING_HEIGHT,
    },
    textPanels: [{ content }],
  });

  const panels = [
    heading(
      0,
      "## Core Web Vitals\n\np75 over the last 7 days, the window Google reports Core Web Vitals over."
    ),
    ...vitals.map((v, i) =>
      queryPanel(
        `rum-${slug}-${v.key}`,
        {
          calculations: [{ op: "P75", column: `${v.key}.value` }],
          time_range: 604800,
        },
        v.label,
        v.description,
        "graph",
        {
          x: (i % VITALS_PER_ROW) * VITAL_WIDTH,
          y: VITALS_ORIGIN_Y + Math.floor(i / VITALS_PER_ROW) * VITAL_HEIGHT,
          width: VITAL_WIDTH,
          height: VITAL_HEIGHT,
        }
      )
    ),
    heading(
      OVERVIEW_HEADING_Y,
      "## RUM overview\n\nPorted from the hand-made `Real User Monitoring (RUM)` board, over a two hour window."
    ),
    ...overview.map(o =>
      queryPanel(
        `rum-${slug}-ov-${o.key}`,
        o.query,
        o.label,
        o.description,
        o.style,
        { ...o.position, y: OVERVIEW_ORIGIN_Y + o.position.y }
      )
    ),
  ];

  const board = new honeycombio.FlexibleBoard(
    `rum-${slug}-board`,
    {
      name: "Real User Monitoring (RUM)",
      description,
      panels,
    },
    providerOpts
  );

  // The triage board is opt-in per environment, and only prod opts in. Ten of
  // the columns its queries reference do not exist in `tollmanz-com-local`, and
  // Honeycomb validates every column when a saved query is created, so building
  // it there fails the apply outright. Seeding the columns would not help: the
  // five `fastly.*` fields come from the Server-Timing header the Fastly edge
  // emits, and nothing in the local stack is behind Fastly, so they can never
  // carry a real value. The five `inp.*` attribution fields need a qualifying
  // user interaction that local browsing generally does not produce. Either way
  // the local board would be sections of permanently empty panels describing
  // infrastructure that is not there.
  if (!triageDescription) {
    return { rumBoardId: board.id };
  }

  // Sections stack vertically: a full-width heading, then that section's panels
  // at their declared offsets, then the next heading below the tallest panel in
  // the section. Sections therefore never need to know their own absolute
  // position, and inserting one does not renumber the rest.
  let y = 0;
  const triagePanels = triage.flatMap(section => {
    const sectionPanels = [
      heading(y, section.heading),
      ...section.panels.map(panel =>
        queryPanel(
          `cwv-${slug}-${panel.key}`,
          panel.query,
          panel.label,
          panel.description,
          panel.style,
          {
            ...panel.position,
            y: y + HEADING_HEIGHT + panel.position.y,
          }
        )
      ),
    ];
    y +=
      HEADING_HEIGHT +
      Math.max(...section.panels.map(p => p.position.y + p.position.height));
    return sectionPanels;
  });

  const triageBoard = new honeycombio.FlexibleBoard(
    `cwv-${slug}-board`,
    {
      name: "Core Web Vitals triage",
      description: triageDescription,
      panels: triagePanels,
    },
    providerOpts
  );

  return { rumBoardId: board.id, triageBoardId: triageBoard.id };
}

// Read a required config key, failing fast with an actionable message so a
// misconfigured apply errors loudly instead of deleting a board.
function requireConfigKey(envVar: string, flag: string): string {
  const key = process.env[envVar];
  if (!key) {
    throw new Error(
      `${flag} is true but ${envVar} is not set. Create a v1 Configuration Key for the target environment in the Honeycomb UI, then set it in the repo-root .env locally or as a GitHub Actions secret in CI. See infra/honeycomb/README.md.`
    );
  }
  return key;
}

let prodBoards: EnvironmentBoards | undefined;
if (manageProdBoard) {
  prodBoards = rumBoard(
    "prod",
    requireConfigKey("HONEYCOMB_CONFIG_KEY", "manageProdBoard"),
    "Core Web Vitals and a RUM overview for tollmanz.com browser RUM. Managed by infra/honeycomb (Pulumi).",
    "Which pages miss a Core Web Vitals threshold, and why. Managed by infra/honeycomb (Pulumi)."
  );
}

let localBoards: EnvironmentBoards | undefined;
if (manageLocalBoard) {
  localBoards = rumBoard(
    "local",
    requireConfigKey("HONEYCOMB_LOCAL_CONFIG_KEY", "manageLocalBoard"),
    // No triage board here: the local dataset lacks the fastly.* and inp.*
    // attribution columns its queries need. See rumBoard.
    "Core Web Vitals and a RUM overview for tollmanz.com browser RUM, local testing environment. Managed by infra/honeycomb (Pulumi)."
  );
}

export const environmentId = environment.id;
export const environmentSlug = environment.slug;
export const localEnvironmentId = localEnvironment.id;
export const localEnvironmentSlug = localEnvironment.slug;

// Ingest keys, marked secret so they stay encrypted in state and masked in CLI
// and CI output. `ingestKey` is consumed by the Fastly stack through a
// StackReference; `localIngestKey` is read by hand for the repo-root .env.
export const ingestKey = pulumi.secret(ingest.key);
export const localIngestKey = pulumi.secret(localIngest.key);

// IDs of the curated boards, when managed. Each RUM board id is undefined until
// its environment's flag is enabled with the matching v1 Configuration Key
// present. There is no local counterpart to the triage board id: only prod
// builds that board (see rumBoard).
export const rumBoardIdProd = prodBoards?.rumBoardId;
export const rumBoardIdLocal = localBoards?.rumBoardId;
export const cwvBoardIdProd = prodBoards?.triageBoardId;
