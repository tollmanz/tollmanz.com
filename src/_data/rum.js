import { readdirSync } from "node:fs";

// RUM is enabled at build time via RUM_MODE (see scripts/build-rum.mjs). When
// off, head.njk omits the script tag and no bundle is shipped.
const mode = process.env.RUM_MODE ?? "off";
const enabled = mode === "local" || mode === "production";

// The bundle is content-hashed (rum.<hash>.js) so it is served immutable, like
// the CSS in src/_data/assets.js. build:js runs before Eleventy and leaves
// exactly one bundle in build/js; find it rather than recomputing the hash so
// the <script> reference and the file can never drift apart.
let url = null;
if (enabled) {
  const bundle = readdirSync("build/js").find(file =>
    /^rum\.[0-9a-f]{8,}\.js$/.test(file)
  );
  if (!bundle) {
    throw new Error(
      "RUM is enabled but build/js contains no rum.<hash>.js bundle. Run `pnpm run build:js` with the same RUM_MODE first."
    );
  }
  url = `/js/${bundle}`;
}

export default { enabled, mode, url };
