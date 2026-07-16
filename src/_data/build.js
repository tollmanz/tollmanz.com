import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Build metadata exposed to templates as the global `build` object. Eleventy
// evaluates this once per build, so every page reflects the same timestamp,
// version, and commit.

// package.json version is the stable, human-readable release marker.
const pkg = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8")
);

// Short commit SHA identifies the exact source a build came from. Prefer a CI
// env var (GitHub Actions sets GITHUB_SHA); fall back to `git rev-parse` for
// local builds; degrade to null when neither is available (e.g. a source
// tarball with no .git checkout and no CI env). Never let a missing SHA fail
// the build.
function shortSha() {
  const ciSha = process.env.GITHUB_SHA;
  if (ciSha) {
    return ciSha.slice(0, 7);
  }
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// Deploy environment. CI builds (GitHub Actions) produce the production site;
// everything else is local development. ELEVENTY_ENV overrides both so a local
// production dry run is possible. Templates can branch on `build.production`.
const environment =
  process.env.ELEVENTY_ENV ??
  (process.env.GITHUB_ACTIONS === "true" ? "production" : "development");

const sha = shortSha();
const version = pkg.version;

export default {
  time: new Date().toISOString(),
  version,
  sha,
  environment,
  production: environment === "production",
  // Convenience string for display: "1.0.0 (abc1234)", or "1.0.0" without git.
  label: sha ? `${version} (${sha})` : version,
};
