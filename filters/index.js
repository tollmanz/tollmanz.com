import { dateDisplay, htmlDateString, monthDay, year } from "./dates.js";
import { head } from "./arrays.js";
import { hasCodeBlocks, paragraphs } from "./content.js";
import {
  eventFacetSlug,
  eventFacets,
  relatedTalks,
  sourceGroups,
  sourceLabel,
  speakingStats,
  talkEventType,
  talkTopics,
  talkType,
  talksByYear,
  topicFacets,
} from "./talks.js";

// Register all custom filters onto the Eleventy config. Filters are grouped by
// concern in sibling modules: date formatting (dates.js), array slicing
// (arrays.js), content inspection (content.js), and the speaking section
// (talks.js).
export default function registerFilters(eleventyConfig) {
  eleventyConfig.addFilter("dateDisplay", dateDisplay);
  eleventyConfig.addFilter("htmlDateString", htmlDateString);
  eleventyConfig.addFilter("year", year);
  eleventyConfig.addFilter("monthDay", monthDay);
  eleventyConfig.addFilter("head", head);
  eleventyConfig.addFilter("hasCodeBlocks", hasCodeBlocks);
  eleventyConfig.addFilter("paragraphs", paragraphs);

  eleventyConfig.addFilter("talkType", talkType);
  eleventyConfig.addFilter("talkTopics", talkTopics);
  eleventyConfig.addFilter("talkEventType", talkEventType);
  eleventyConfig.addFilter("sourceGroups", sourceGroups);
  eleventyConfig.addFilter("sourceLabel", sourceLabel);
  eleventyConfig.addFilter("topicFacets", topicFacets);
  eleventyConfig.addFilter("eventFacets", eventFacets);
  eleventyConfig.addFilter("eventFacetSlug", eventFacetSlug);
  eleventyConfig.addFilter("talksByYear", talksByYear);
  eleventyConfig.addFilter("speakingStats", speakingStats);
  eleventyConfig.addFilter("relatedTalks", relatedTalks);
}
