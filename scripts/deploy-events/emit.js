#!/usr/bin/env node
// Deploy-event emitter.
//
// Run as the final step of each deploy workflow. Builds the canonical event
// (event.js) from the GitHub Actions environment and dispatches it to every
// adapter named in DEPLOY_EVENT_SINKS (comma-separated). Vendor-neutral: adding
// a sink is one adapter file plus a secret, no change here.
//
// Usage:
//   node scripts/deploy-events/emit.js --type=site
//   node scripts/deploy-events/emit.js --type=infra --dry-run
//
// Environment:
//   DEPLOY_EVENT_SINKS   comma-separated adapter names, e.g. "honeycomb"
//   plus each adapter's own secrets (see the adapter files)
//
// Exits non-zero if any enabled sink fails, so a failure is visible in the run.
// The workflow step wraps this in continue-on-error, so a sink outage annotates
// the run without failing a deploy that already succeeded.

import { buildEvent, validateEvent } from "./event.js";
import * as honeycomb from "./adapters/honeycomb.js";

// Adapter registry: sink name -> adapter module.
const ADAPTERS = { honeycomb };

function parseArgs(argv) {
  const args = { type: undefined, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg.startsWith("--type=")) {
      args.type = arg.slice("--type=".length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseSinks(env) {
  return (env.DEPLOY_EVENT_SINKS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

async function main() {
  const { type, dryRun } = parseArgs(process.argv.slice(2));
  if (!type) {
    throw new Error("missing required --type=site|infra");
  }

  const event = validateEvent(buildEvent({ type }));
  const sinks = parseSinks(process.env);

  if (dryRun) {
    console.log("canonical event:");
    console.log(JSON.stringify(event, null, 2));
  }

  if (sinks.length === 0) {
    console.warn("DEPLOY_EVENT_SINKS is empty; no adapters to dispatch to.");
    return;
  }

  let failures = 0;
  for (const sink of sinks) {
    const adapter = ADAPTERS[sink];
    if (!adapter) {
      console.error(`unknown sink "${sink}"; skipping.`);
      failures += 1;
      continue;
    }

    if (dryRun) {
      console.log(`\n[${adapter.name}] would send:`);
      console.log(JSON.stringify(adapter.request(event, process.env), null, 2));
      continue;
    }

    try {
      await adapter.send(event, process.env);
      console.log(`[${adapter.name}] ok`);
    } catch (err) {
      console.error(`[${adapter.name}] ${err.message}`);
      failures += 1;
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
