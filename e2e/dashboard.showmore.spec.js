const { test, expect } = require('@playwright/test');
const { launchApp, makeTempDir, seedUserData, fixtureProject } = require('./helpers');

test.describe('dashboard show more', () => {
  test('caps the project grid at 12 cards and Show all expands it', async () => {
    const userData = await makeTempDir('devlauncher-showmore-');
    const projects = Array.from({ length: 15 }, (_, i) =>
      fixtureProject(`showmore-${i}`, `/tmp/showmore-${i}`, {
        name: `Show More ${i + 1}`,
        port: 3000 + i,
        type: i % 2 === 0 ? 'NODEJS' : 'GOLANG',
      }),
    );
    await seedUserData(userData, { projects, config: { minimizeToTray: false } });

    let app = null;
    try {
      const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData });
      app = launched.app;
      const { window } = launched;

      // Project cards are the only <article> elements on the dashboard, so
      // count them directly — a text regex also matched the hidden Command
      // Palette entries, and specific names are unsafe because the dashboard
      // sorts by name ("Show More 13" sorts inside the first 12).
      const cards = window.locator('article');
      await expect(cards).toHaveCount(12, { timeout: 15000 });

      // The Show all button carries the full count.
      const showAll = window.getByRole('button', { name: 'Show all (15 projects)' });
      await expect(showAll).toBeVisible();

      // Expanding renders every card and hides the button.
      await showAll.click();
      await expect(cards).toHaveCount(15);
      await expect(window.getByRole('button', { name: /show all/i })).not.toBeVisible();
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
