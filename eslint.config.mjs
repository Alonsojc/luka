import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "apps/web/public/sw.js",
      "apps/web/next-env.d.ts",
      "**/*.config.js",
      "**/*.config.mjs",
    ],
  },

  // Base JS/TS rules for all packages
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Relax rules that are too noisy for an existing codebase
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/triple-slash-reference": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "warn",
      "no-useless-assignment": "warn",
    },
  },

  // React-specific rules for the web app
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // NestJS backend — allow decorators and empty functions (lifecycle hooks)
  {
    files: ["apps/api/**/*.ts"],
    rules: {
      "@typescript-eslint/no-empty-function": "off",
    },
  },
);
