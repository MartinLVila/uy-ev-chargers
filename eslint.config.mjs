import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const rawHtmlSinks = [
  {
    selector: "AssignmentExpression[left.property.name='innerHTML']",
    message: "Assigning innerHTML renders unescaped HTML. Render text, or build nodes.",
  },
  {
    selector: "AssignmentExpression[left.property.name='outerHTML']",
    message: "Assigning outerHTML renders unescaped HTML. Render text, or build nodes.",
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: "insertAdjacentHTML renders unescaped HTML. Render text, or build nodes.",
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name='write']",
    message: "document.write renders unescaped HTML and blocks parsing.",
  },
];

const defaultIgnoresOfEslintConfigNext = [".next/**", "out/**", "build/**", "next-env.d.ts"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react/no-danger": "error",
      "no-restricted-syntax": ["error", ...rawHtmlSinks],
    },
  },
  globalIgnores(defaultIgnoresOfEslintConfigNext),
]);

export default eslintConfig;
