import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Fingerprint each CSS source by content hash so the built file can be served
// immutable (cached forever in the browser and at the edge). The hash is derived
// from the source bytes: any edit changes the hash, which changes the output
// URL, which busts every cache the instant a new build ships. Minification is a
// deterministic function of the source, so hashing the source is enough to
// guarantee a new URL whenever the delivered bytes change.
//
// This is the single source of truth for asset URLs. src/css/css.11tydata.js
// reads it to set each stylesheet's output path, and head.njk reads it to write
// the matching <link>, so the reference and the file can never drift apart.
const sources = {
  main: "src/css/main.css",
  "syntax-highlighting": "src/css/syntax-highlighting.css",
};

const css = {};
for (const [slug, file] of Object.entries(sources)) {
  const bytes = readFileSync(join(process.cwd(), file));
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  css[slug] = { hash, url: `/css/${slug}.${hash}.css` };
}

export default { css };
