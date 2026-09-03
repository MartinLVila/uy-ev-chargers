import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const UNESCAPED_HTML = "This renders unescaped HTML. Render text, or build nodes.";

const rawHtmlSinks = [
  {
    selector: "AssignmentExpression[left.property.name=/^(inner|outer)HTML$/]",
    message: UNESCAPED_HTML,
  },
  {
    selector: "AssignmentExpression[left.property.value=/^(inner|outer)HTML$/]",
    message: UNESCAPED_HTML,
  },
  {
    selector:
      "CallExpression[callee.property.name=/^(insertAdjacentHTML|setHTMLUnsafe|createContextualFragment)$/]",
    message: UNESCAPED_HTML,
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name=/^writel?n?$/]",
    message: UNESCAPED_HTML,
  },
  {
    selector:
      "CallExpression[callee.object.property.name='document'][callee.property.name=/^writel?n?$/]",
    message: UNESCAPED_HTML,
  },
  {
    selector: "Property[key.name='dangerouslySetInnerHTML']",
    message: UNESCAPED_HTML,
  },
];

const ERASED_BEFORE_IT_RUNS =
  "Type assertions are erased before this file runs, so the test passes whatever the type says. Put them in a *.test-d.ts file, where tsc checks them.";

const TYPE_ASSERTIONS = ["expectTypeOf", "assertType"];

const typeAssertionCalls = [
  {
    selector: `CallExpression[callee.name=/^(${TYPE_ASSERTIONS.join("|")})$/]`,
    message: ERASED_BEFORE_IT_RUNS,
  },
  {
    selector: `CallExpression[callee.property.name=/^(${TYPE_ASSERTIONS.join("|")})$/]`,
    message: ERASED_BEFORE_IT_RUNS,
  },
];

const typeAssertionImports = {
  paths: [{ name: "vitest", importNames: TYPE_ASSERTIONS, message: ERASED_BEFORE_IT_RUNS }],
};

const defaultIgnoresOfEslintConfigNext = [".next/**", "out/**", "build/**", "next-env.d.ts"];

const themeScriptMustBlockUntilItHasRun = {
  files: ["src/app/layout.tsx"],
  rules: { "@next/next/no-sync-scripts": "off" },
};

const typeAssertionsBelongInATypeTest = {
  files: ["**/*.test-d.ts?(x)"],
  rules: {
    "no-restricted-syntax": ["error", ...rawHtmlSinks],
    "no-restricted-imports": "off",
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react/no-danger": "error",
      "no-restricted-syntax": ["error", ...rawHtmlSinks, ...typeAssertionCalls],
      "no-restricted-imports": ["error", typeAssertionImports],
    },
  },
  typeAssertionsBelongInATypeTest,
  themeScriptMustBlockUntilItHasRun,
  globalIgnores(defaultIgnoresOfEslintConfigNext),
]);

export default eslintConfig;
