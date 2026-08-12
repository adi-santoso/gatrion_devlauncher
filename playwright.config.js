const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'off',
  },
  webServer: {
    command: 'npm run dev:vite',
    url: `http://localhost:${process.env.VITE_DEV_PORT || 5173}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: { ...process.env },
  },
});
