// Discover fingerprinted asset URLs from the rendered homepage.
//
// CSS and font filenames carry a content hash that changes on every content
// edit, so the suite cannot hard-code them. It reads the live HTML once and
// pulls a hashed stylesheet and a woff2 font out of it, then the cache tests
// assert the immutable policy against whatever the current build shipped.

import { config } from "../config.js";
import { fetchText } from "./curl.js";

let cached;

export async function discoverAssets() {
  if (cached) return cached;
  const html = await fetchText(`${config.baseUrl}/`);
  const css = html.match(/\/css\/[a-z0-9-]+\.[0-9a-f]{8,}\.css/i);
  const font = html.match(/\/fonts\/[A-Za-z0-9._-]+\.woff2/);
  cached = {
    html,
    cssUrl: css ? `${config.baseUrl}${css[0]}` : null,
    fontUrl: font ? `${config.baseUrl}${font[0]}` : null,
  };
  return cached;
}
