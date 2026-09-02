const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { launchApp, makeTempDir, writeFixtureProject, seedUserData, fixtureProject } = require('./helpers');

test.describe('Laravel application logs', () => {
  test('Logs tab appears for Laravel projects and shows storage/logs content', async () => {
    // Use a simple Node fixture project, but override it to look like Laravel
    // so the Logs tab appears (type: LARAVEL) and the storage/logs dir exists.
    const projectDir = await makeTempDir('devlauncher-larlog-');
    await writeFixtureProject(projectDir);

    // Create storage/logs with a real log file.
    const logsDir = path.join(projectDir, 'storage', 'logs');
    await fs.promises.mkdir(logsDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(logsDir, 'laravel.log'),
      `[2026-01-01 10:00:00] production.ERROR: Database connection failed
[2026-01-01 10:00:01] production.INFO: User logged in
`
    );

    const userData = await makeTempDir('devlauncher-larlog-ui-');
    const project = fixtureProject('larlog', projectDir, {
      name: 'Laravel Log Test',
      type: 'LARAVEL',
      port: 8000,
      startCommand: 'php artisan serve',
      commands: [
        { id: 'app', name: 'Laravel', command: 'php artisan serve', port: 8000, primary: true },
      ],
    });
    await seedUserData(userData, { projects: [project], config: { minimizeToTray: false } });

    let app = null;
    try {
      const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData });
      app = launched.app;
      const { window } = launched;

      // Navigate to the project detail
      await window.getByText('Laravel Log Test').first().click();
      await expect(window.getByRole('button', { name: 'Back to Projects' })).toBeVisible({ timeout: 10000 });

      // The Logs tab is visible for Laravel projects
      await expect(window.getByRole('tab', { name: 'Logs' })).toBeVisible({ timeout: 10000 });
      await window.getByRole('tab', { name: 'Logs' }).click();

      // The log file loads and content appears
      await expect(window.getByText(/Database connection failed/i).first()).toBeVisible({ timeout: 15000 });
      await expect(window.getByText(/User logged in/i).first()).toBeVisible({ timeout: 5000 });

      // The file selector shows the log file
      const selector = window.getByLabel('Select Laravel log file');
      await expect(selector).toBeVisible();
      await expect(selector).toHaveValue('laravel.log');
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