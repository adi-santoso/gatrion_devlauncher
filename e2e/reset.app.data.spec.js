const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { launchApp, makeTempDir, seedUserData, fixtureProject } = require('./helpers');

test.describe('reset app data', () => {
  test('settings reset flow writes the pending marker after typing RESET', async () => {
    const projectDir = await makeTempDir('devlauncher-resetproj-');
    const userData = await makeTempDir('devlauncher-reset-e2e-');
    const project = fixtureProject('reset-p1', projectDir, { name: 'reset-proj', port: 3002 });
    await seedUserData(userData, { projects: [project], config: { minimizeToTray: false } });
    // Simulate an installed app that has accumulated data
    fs.writeFileSync(path.join(userData, 'health.json'), JSON.stringify({ projects: {} }));
    fs.writeFileSync(path.join(userData, 'presets.json'), JSON.stringify([]));

    let app = null;
    try {
      const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData, DEVLAUNCHER_E2E_NO_RELAUNCH: '1' });
      app = launched.app;
      const { window } = launched;

      // Navigate to Settings → Data & Backup
      await window.getByRole('button', { name: 'Settings' }).click();
      await window.getByRole('tab', { name: 'Data & Backup' }).click();

      // Open the reset modal
      await window.getByRole('button', { name: 'Reset app data…' }).click();
      await expect(window.getByText('Reset all DevLauncher data?')).toBeVisible();

      // Confirm stays disabled until the exact word RESET is typed
      const confirm = window.getByRole('button', { name: 'Reset & restart' });
      await expect(confirm).toBeDisabled();
      const input = window.getByLabel('Type RESET to confirm');
      await input.fill('reset');
      await expect(confirm).toBeEnabled();
      await input.fill('RESET');

      await confirm.click();

      // The marker exists so the next launch wipes app data
      await expect.poll(() => fs.existsSync(path.join(userData, '.reset-pending')), {
        timeout: 10000,
        message: 'reset marker should be written to userData',
      }).toBe(true);
      // Existing data is still there (deletion happens on next launch)
      expect(fs.existsSync(path.join(userData, 'projects.json'))).toBe(true);
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
