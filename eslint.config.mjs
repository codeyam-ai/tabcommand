import js from '@eslint/js';
import react from 'eslint-plugin-react';
import globals from 'globals';

export default [
  {
    ignores: [
      'build/**',
      'node_modules/**',
      'dev-dist/**',
      // Tooling / editor scaffolding — not part of the app source.
      '.claude/**',
      '.codeyam/**',
      '.codex/**',
      // Ported verbatim from the original extension — kept byte-identical and
      // intentionally not modernized, so they are excluded from the lint gate.
      // (Their *.test.js harnesses are NOT ignored — those are our code.)
      'service_worker.js',
      'popup/popup.js',
      'popup/popup.css',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/setupTests.js'],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  },
  {
    // Build/lint config files run under Node.
    files: ['*.config.{js,mjs}', 'vite.config.mjs', 'eslint.config.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
];
