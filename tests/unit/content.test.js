import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCodeBlocks } from "../../filters/content.js";

test("hasCodeBlocks is true for Prism-highlighted markup", () => {
  const html =
    '<pre class="language-js"><code class="language-js">1</code></pre>';
  assert.equal(hasCodeBlocks(html), true);
});

test("hasCodeBlocks is false for a plain code block without a language class", () => {
  assert.equal(hasCodeBlocks("<pre><code>plain</code></pre>"), false);
});

test("hasCodeBlocks is false for content with no code blocks", () => {
  assert.equal(hasCodeBlocks("<p>just a paragraph</p>"), false);
});

test("hasCodeBlocks is false for an empty string", () => {
  assert.equal(hasCodeBlocks(""), false);
});

test("hasCodeBlocks returns false for non-string input", () => {
  assert.equal(hasCodeBlocks(null), false);
  assert.equal(hasCodeBlocks(undefined), false);
  assert.equal(hasCodeBlocks(42), false);
  assert.equal(hasCodeBlocks(['<code class="language-js">']), false);
});
