/**
 * Self-contained ESLint config for the web package (root: true stops the
 * monorepo config from cascading Node-only rules onto React/JSX files).
 */
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'prettier'],
  // Anchor Next's page-detection to this package so a monorepo-root `eslint .`
  // does not warn about a missing pages/ directory.
  settings: { next: { rootDir: __dirname } },
};
