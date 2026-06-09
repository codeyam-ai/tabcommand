---
name: no-proptypes-in-ports
description: When porting reference TabCommand components to modern, drop PropTypes — don't carry them forward
metadata:
  type: feedback
---

When porting `../tabcommand/` reference components into the modern reproduction, strip `PropTypes` (the `import PropTypes`, the `*.propTypes = {...}` blocks, and any inline `Component.propTypes`). Do NOT add `prop-types` as a dependency.

**Why:** PropTypes are deprecated in React 19 (the modern target); the project's `eslint.config.js` already sets `'react/prop-types': 'off'`, signaling it doesn't want them; and there's no TypeScript, so they'd be the only (deprecated) type annotation. Decided by the user on 2026-06-09 during the Home shell + Active Tabs plan.

**How to apply:** When a port instruction says "PropTypes retained" or the reference file has PropTypes, omit them and keep the component otherwise faithful. If type safety is wanted later, use TS/JSDoc, not PropTypes.
