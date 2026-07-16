import { dateDisplay } from "./dates.js";
import { head } from "./arrays.js";
import { hasCodeBlocks } from "./content.js";

// Register all custom filters onto the Eleventy config. Filters are grouped by
// concern in sibling modules: date formatting (dates.js), array slicing
// (arrays.js), and content inspection (content.js).
export default function registerFilters(eleventyConfig) {
  eleventyConfig.addFilter("dateDisplay", dateDisplay);
  eleventyConfig.addFilter("head", head);
  eleventyConfig.addFilter("hasCodeBlocks", hasCodeBlocks);
}
