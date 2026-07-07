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
      // service_worker.js and popup.js use plain-script globals that the
      // React/flat config rules don't apply to, so they're excluded from the
      // lint gate. (Their *.test.js harnesses are NOT ignored.)
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
    // Build/lint config files and codeyam build tooling run under Node.
    files: [
      '*.config.{js,mjs}',
      'vite.config.mjs',
      'eslint.config.mjs',
      'codeyam/**/*.{js,mjs}',
    ],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
];
