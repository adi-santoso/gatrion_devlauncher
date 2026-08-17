const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { launchApp, makeTempDir, writeFixtureProject, seedUserData, fixtureProject } = require('./helpers');

test.describe('env editor syntax highlighting', () => {
  test('edit mode keeps the highlighted layer over a transparent textarea', async () => {
    const projectDir = await writeFixtureProject(await makeTempDir('devlauncher-envproj-'));
    // Give the project a real .env so the env file section appears.
    await fs.promises.writeFile(
      path.join(projectDir, '.env'),
      'APP_KEY=secret123\nDATABASE_URL=postgres://localhost/db\n# comment line\n',
    );
    const userData = await makeTempDir('devlauncher-envtest-');
    const project = fixtureProject('env-fix', projectDir, { name: 'env-proj', port: 3001 });
    await seedUserData(userData, { projects: [project], config: { minimizeToTray: false } });

    let app = null;
    try {
      const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData });
      app = launched.app;
      const { window } = launched;

      await window.getByText('env-proj').first().click();
      await expect(window.getByRole('button', { name: 'Back to Projects' })).toBeVisible({ timeout: 10000 });
      await window.getByRole('tab', { name: 'Environment' }).click();

      // The highlighted read view is present with colored spans
      const readView = window.getByLabel('Content of .env');
      await expect(readView).toBeVisible({ timeout: 10000 });
      await expect(readView.locator('.text-accent').first()).toHaveText('APP_KEY');

      // Enter edit mode: highlighted layer stays, textarea is transparent
      await window.getByRole('button', { name: 'Edit', exact: true }).click();
      const highlight = window.locator('pre[aria-hidden="true"]');
      await expect(highlight).toBeVisible();
      await expect(highlight.locator('.text-accent').first()).toHaveText('APP_KEY');
      await expect(highlight).toContainText('secret123');

      const editor = window.getByLabel('Edit .env');
      await expect(editor).toBeVisible();
      expect(await editor.getAttribute('class')).toContain('text-transparent');
      await expect(editor).toHaveValue(/APP_KEY=secret123/);

      // Typing updates both layers with the same content
      await editor.fill('NEW_KEY=hello\n');
      await expect(highlight).toContainText('NEW_KEY=hello');
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
