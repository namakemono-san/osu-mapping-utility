import importPlugin from "eslint-plugin-import";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      import: importPlugin,
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "import/no-relative-packages": "error",
    },
  },
];
