import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["public/**", "node_modules/**"] },
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
];
