const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { launchApp, makeTempDir, seedUserData, fixtureProject, writeFixtureProject } = require('./helpers');

/**
 * Project detail interactive shell (node-pty + xterm):
 * - The terminal is NOT auto-spawned: opening the Terminal tab shows an
 *   "Interactive shell" card with a "Start shell" button and no xterm yet.
 * - "Start shell" spawns a real PTY in the project folder (xterm renders a
 *   shell prompt), and the button flips to "Close shell".
 * - "Close shell" kills the PTY and removes the terminal from the page.
 */
test.describe('project detail interactive shell', () => {
  test('starts and closes a shell in the project folder on demand', async () => {
    const projectDir = await writeFixtureProject(await makeTempDir('devlauncher-termshell-'));
    const userData = await makeTempDir('devlauncher-termshell-ud-');
    const project = fixtureProject('term-shell', projectDir, { name: 'e2e-term-shell' });
    await seedUserData(userData, { projects: [project], config: { minimizeToTray: false } });

    let app = null;
    try {
      const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData });
      app = launched.app;
      const { window } = launched;

      // Open project detail and switch to the Terminal tab.
      await window.getByText('e2e-term-shell').first().click();
      await expect(window.getByRole('button', { name: 'Back to Projects' })).toBeVisible({ timeout: 10000 });
      await window.getByRole('tab', { name: 'Terminal' }).click();

      // No shell auto-spawns; the explicit action is offered.
      await expect(window.getByRole('button', { name: 'Start shell' })).toBeVisible({ timeout: 10000 });
      expect(await window.locator('.xterm').count()).toBe(0);

      // Start the shell -> a real xterm mounts and a shell prompt appears
      // (proves the PTY actually spawned through node-pty).
      await window.getByRole('button', { name: 'Start shell' }).click();
      const xterm = window.locator('.xterm-screen').first();
      await expect(xterm).toBeVisible({ timeout: 10000 });
      await expect(window.getByRole('button', { name: 'Close shell' })).toBeVisible({ timeout: 10000 });
      // Poll until the shell has printed at least a prompt (non-empty output).
      await expect
        .poll(async () => (await xterm.innerText().catch(() => '')).trim().length, {
          timeout: 15000,
          message: 'started shell should produce prompt output',
        })
        .toBeGreaterThan(0);

      // Close the shell -> the PTY is killed and the terminal unmounts.
      await window.getByRole('button', { name: 'Close shell' }).click();
      await expect(window.getByRole('button', { name: 'Start shell' })).toBeVisible({ timeout: 10000 });
      await expect(window.locator('.xterm')).toHaveCount(0, { timeout: 10000 });
    } finally {
      // Hard-kill the whole tree: a leaked PTY child keeps stdio pipes open and
      // would hang Playwright's worker teardown (same reasoning as the preview
      // fullscreen spec).
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
