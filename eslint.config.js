import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["public/**", "node_modules/**", "build/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    // Browser RUM entry: browser globals, plus process.env.* build-time
    // constants that esbuild substitutes (see scripts/build-rum.mjs).
    files: ["assets/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, process: "readonly" },
    },
  },
  {
    // RUM browser harness: Node code that also carries page.evaluate callbacks,
    // whose bodies are serialized and run inside the browser, so they reference
    // browser globals that never exist in this file's own scope.
    files: ["tests/rum/lib/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
