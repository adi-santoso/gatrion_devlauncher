const { test, expect } = require('@playwright/test');
const { launchApp, makeTempDir, seedUserData, fixtureProject } = require('./helpers');

/**
 * The dashboard defaults to sorting by "last run" (most recently started
 * first). This spec seeds projects with staggered lastRun timestamps and
 * asserts the rendered card order follows that sort without any interaction.
 */
test.describe('dashboard last-run sort', () => {
  test('sorts project cards by most-recently-run by default', async () => {
    const userData = await makeTempDir('devlauncher-lastrun-');
    const projects = [
      fixtureProject('lr-old', '/tmp/lr-old', {
        name: 'Oldest Run',
        port: 3001,
        lastRun: '2024-01-05T08:00:00.000Z',
      }),
      fixtureProject('lr-new', '/tmp/lr-new', {
        name: 'Newest Run',
        port: 3002,
        lastRun: '2024-09-01T12:00:00.000Z',
      }),
      fixtureProject('lr-mid', '/tmp/lr-mid', {
        name: 'Middle Run',
        port: 3003,
        lastRun: '2024-05-15T10:00:00.000Z',
      }),
      fixtureProject('lr-never', '/tmp/lr-never', {
        name: 'Never Run',
        port: 3004,
      }),
    ];
    await seedUserData(userData, { projects, config: { minimizeToTray: false } });

    let app = null;
    try {
      const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData });
      app = launched.app;
      const { window } = launched;

      // The card heading is the first <strong> in each <article>. Assert the
      // whole order so a regression to name-sort (or a wrong direction) fails.
      const names = () => window.locator('article strong').allTextContents();
      await expect.poll(async () => (await names()).map((n) => n.trim()).filter(Boolean), {
        timeout: 15000,
        message: 'cards should be ordered by most recent lastRun, never-run last',
      }).toEqual(['Newest Run', 'Middle Run', 'Oldest Run', 'Never Run']);
    } finally {
      if (app) {
        const pid = app.process().pid;
        if (pid && process.platform === 'win32') {
          try { require('child_process').execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* already dead */ }
        }
        try { app.process().kill('SIGKILL'); } catch { /* already dead */ }
      }
    }
  });
});
