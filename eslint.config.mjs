import { existsSync, readdirSync } from "node:fs";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsdoc from "eslint-plugin-jsdoc";

const features = existsSync("src/features")
  ? readdirSync("src/features", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];

const tsdoc = jsdoc.configs["flat/recommended-tsdoc-error"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: ["./src/components", "./src/hooks", "./src/lib", "./src/db"],
              from: ["./src/features", "./src/app"],
              message: "Shared code can't depend on features or routes.",
            },
            {
              target: "./src/features",
              from: "./src/app",
              message: "Features can't import routes.",
            },
            ...features.map((feature) => ({
              target: `./src/features/${feature}`,
              from: "./src/features",
              except: [`./${feature}`],
              message: "A feature can't import another feature: compose them in src/app.",
            })),
          ],
        },
      ],
    },
  },
  {
    ...tsdoc,
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/**", "**/*.test.{ts,tsx}"],
    rules: {
      ...tsdoc.rules,
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ArrowFunctionExpression: true },
        },
      ],
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/check-tag-names": ["error", { definedTags: ["remarks"] }],
      "jsdoc/tag-lines": ["error", "never", { startLines: 1 }],
    },
  },
  {
    rules: {
      "no-inline-comments": "error",
      "no-warning-comments": ["error", { terms: ["todo", "fixme"], location: "anywhere" }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
