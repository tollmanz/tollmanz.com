// Return the first n items of an array, or the last |n| when n is negative.
// Used by the RSS feed to cap the number of posts. Guards non-array input and
// non-numeric n by returning an empty array.
export function head(array, n) {
  if (!Array.isArray(array) || array.length === 0) {
    return [];
  }
  if (!Number.isFinite(n)) {
    return [];
  }
  if (n < 0) {
    return array.slice(n);
  }
  return array.slice(0, n);
}
