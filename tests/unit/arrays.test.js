import { test } from "node:test";
import assert from "node:assert/strict";
import { head } from "../../filters/arrays.js";

test("head returns the first n items", () => {
  assert.deepEqual(head([1, 2, 3, 4, 5], 3), [1, 2, 3]);
});

test("head returns the last |n| items when n is negative", () => {
  assert.deepEqual(head([1, 2, 3, 4, 5], -2), [4, 5]);
});

test("head returns an empty array when n is 0", () => {
  assert.deepEqual(head([1, 2, 3], 0), []);
});

test("head caps at the array length when n exceeds it", () => {
  assert.deepEqual(head([1, 2], 10), [1, 2]);
});

test("head returns an empty array for non-array input", () => {
  assert.deepEqual(head(null, 3), []);
  assert.deepEqual(head("abc", 3), []);
  assert.deepEqual(head(undefined, 3), []);
});

test("head returns an empty array for an empty array", () => {
  assert.deepEqual(head([], 3), []);
});

test("head returns an empty array when n is not a finite number", () => {
  assert.deepEqual(head([1, 2, 3]), []);
  assert.deepEqual(head([1, 2, 3], NaN), []);
  assert.deepEqual(head([1, 2, 3], Infinity), []);
});
