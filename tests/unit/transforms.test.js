import { test } from "node:test";
import assert from "node:assert/strict";
import registerTransforms, { shouldMinify } from "../../transforms/index.js";
import htmlmin from "../../transforms/htmlmin.js";
import cssmin from "../../transforms/cssmin.js";

// Minimal stand-in for the Eleventy config surface the module touches, so
// registration runs for real.
function fakeConfig() {
  const transforms = {};
  return {
    transforms,
    addTransform(name, callback) {
      transforms[name] = callback;
    },
  };
}

// Transforms read this.page.outputPath to decide whether they apply.
function page(outputPath) {
  return { page: { outputPath } };
}

// Swallow the console.warn a fallback path emits, and hand back what it logged.
function captureWarnings(run) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    return { result: run(), warnings };
  } finally {
    console.warn = original;
  }
}

test("shouldMinify is true only for the build run mode", () => {
  assert.equal(shouldMinify({ ELEVENTY_RUN_MODE: "build" }), true);
  assert.equal(shouldMinify({ ELEVENTY_RUN_MODE: "serve" }), false);
  assert.equal(shouldMinify({ ELEVENTY_RUN_MODE: "watch" }), false);
  assert.equal(shouldMinify({}), false);
});

test("registerTransforms registers both transforms for a production build", () => {
  const previous = process.env.ELEVENTY_RUN_MODE;
  process.env.ELEVENTY_RUN_MODE = "build";
  try {
    const config = fakeConfig();
    registerTransforms(config);
    assert.deepEqual(Object.keys(config.transforms).sort(), [
      "cssmin",
      "htmlmin",
    ]);
  } finally {
    process.env.ELEVENTY_RUN_MODE = previous;
  }
});

test("registerTransforms registers nothing for the dev server", () => {
  const previous = process.env.ELEVENTY_RUN_MODE;
  process.env.ELEVENTY_RUN_MODE = "serve";
  try {
    const config = fakeConfig();
    registerTransforms(config);
    assert.deepEqual(Object.keys(config.transforms), []);
  } finally {
    process.env.ELEVENTY_RUN_MODE = previous;
  }
});

test("htmlmin minifies .html output", async () => {
  const html = "<html>  <body>   <p>hi</p>  </body>  </html>";
  const output = await htmlmin.call(page("public/index.html"), html);
  assert.equal(output.includes("   "), false);
  assert.match(output, /<p>hi<\/p>/);
});

test("htmlmin strips comments from .html output", async () => {
  const output = await htmlmin.call(
    page("public/index.html"),
    "<p>hi</p><!-- gone -->"
  );
  assert.equal(output.includes("gone"), false);
});

test("htmlmin leaves non-HTML output untouched", async () => {
  const content = "body {\n  color: red;\n}\n";
  assert.equal(await htmlmin.call(page("public/style.css"), content), content);
  assert.equal(await htmlmin.call(page(undefined), content), content);
});

test("htmlmin falls back to the original content when minify throws", async () => {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    // html-minifier-terser wants a string; a Buffer from an upstream transform
    // throws inside minify rather than returning a result.
    const content = Buffer.from("<p>hi</p>");
    const output = await htmlmin.call(page("public/broken.html"), content);
    assert.equal(output, content);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /public\/broken\.html/);
  } finally {
    console.warn = original;
  }
});

test("cssmin minifies .css output", () => {
  const output = cssmin.call(
    page("public/style.css"),
    "body {\n  color: #ff0000;\n}\n"
  );
  assert.equal(output, "body{color:red}");
});

test("cssmin leaves non-CSS output untouched", () => {
  const content = "<p>hi</p>";
  assert.equal(cssmin.call(page("public/index.html"), content), content);
  assert.equal(cssmin.call(page(undefined), content), content);
});

test("cssmin falls back to the original content when clean-css reports errors", () => {
  const content = '@import url("does-not-exist.css");\nbody{color:red}';
  const { result, warnings } = captureWarnings(() =>
    cssmin.call(page("public/style.css"), content)
  );
  assert.equal(result, content);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][0], /public\/style\.css/);
});
