// RUM is enabled at build time via RUM_MODE (see scripts/build-rum.mjs). When
// off, head.njk omits the script tag and no bundle is shipped.
const mode = process.env.RUM_MODE ?? "off";

export default {
  enabled: mode === "local" || mode === "production",
  mode,
};
