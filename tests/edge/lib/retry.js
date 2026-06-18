// Retry an async assertion a few times before giving up.
//
// Right after a deploy the edge can briefly serve a transient state: a
// freshly-fingerprinted asset whose origin object has not finished propagating,
// or an old object cached just before a VCL change. The contract converges
// within seconds, so the cache assertions retry rather than fail on the first
// transient miss.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function retry(fn, { tries = 4, delayMs = 3000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < tries) await sleep(delayMs);
    }
  }
  throw lastErr;
}
