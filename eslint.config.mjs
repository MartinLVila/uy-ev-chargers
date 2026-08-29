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
