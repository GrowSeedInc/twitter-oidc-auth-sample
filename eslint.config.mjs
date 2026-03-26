import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import tsdocPlugin from "eslint-plugin-tsdoc";

export default tseslint.config(
  // グローバル ignores
  {
    ignores: ["**/node_modules/**", "**/dist/**"],
  },

  // JS 基本ルール（全ファイル）
  js.configs.recommended,

  // client: TypeScript + React ルール
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["client/src/**/*.{ts,tsx}"],
  })),
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      tsdoc: tsdocPlugin,
    },
    languageOptions: {
      parserOptions: {
        project: "./client/tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // React 17+ JSX transform
      "react/prop-types": "off",         // TypeScript で代替
      "@typescript-eslint/no-unused-vars": "off", // tsconfig の noUnusedLocals で対応済み
      "tsdoc/syntax": "warn",
    },
  },

  // server: TypeScript + Node.js ルール
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["server/src/**/*.ts"],
  })),
  {
    files: ["server/src/**/*.ts"],
    plugins: {
      tsdoc: tsdocPlugin,
    },
    languageOptions: {
      parserOptions: {
        project: "./server/tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "tsdoc/syntax": "warn",
    },
  },
);
