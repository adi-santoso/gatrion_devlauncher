/* global __dirname */
const base = require('../../../playwright.config');
const path = require('path');

module.exports = {
  ...base,
  testDir: path.resolve(__dirname, '../../../e2e'),
  testMatch: 'add.project.regressions.spec.js',
  outputDir: path.resolve(__dirname, '../../../test-results'),
};
