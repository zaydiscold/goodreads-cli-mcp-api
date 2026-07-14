// Flat config for ESLint v10. typescript-eslint over the two source trees, with the
// existing `any`/unused-var debt kept as advisory WARNINGS (not hard errors) so the lint
// runs green today and can be tightened later. Mirrors the robinhood-cli config.
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/*.mjs", "**/*.cjs"] },
  {
    files: ["cli/**/*.ts", "mcp/**/*.ts"],
    languageOptions: { parser: tsParser, ecmaVersion: "latest", sourceType: "module" },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }]
    }
  },
  {
    files: ["cli/src/**/*.ts", "mcp/src/**/*.ts"],
    rules: {
      complexity: ["error", 20],
      "max-lines-per-function": [
        "error",
        { max: 80, skipBlankLines: true, skipComments: true, IIFEs: true }
      ]
    }
  }
];
