const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { launchApp, makeTempDir, writeFixtureProject } = require('./helpers');

test.describe('project lifecycle', () => {
  test('adds a project via the modal, starts it, streams logs, and stops it', async () => {
    const userData = await makeTempDir('devlauncher-flow-');
    const projectDir = await writeFixtureProject(await makeTempDir('devlauncher-proj-'));

    const { app, window } = await launchApp({
      DEVLAUNCHER_USER_DATA: userData,
      DEVLAUNCHER_TEST_FOLDER: projectDir,
    });

    // --- Add project through the modal (native folder picker is bypassed in test mode) ---
    await window.getByRole('button', { name: /add project/i }).first().click();
    const modal = window.locator('#projectModal');
    // The empty state shows "Browse Project Folder" — clicking it triggers detection
    await modal.getByRole('button', { name: /browse project folder/i }).click();
    // Detection fills the form; the folder summary shows the detected config
    await expect(modal.getByText('e2e-fixture').first()).toBeVisible({ timeout: 15000 });
    await expect(modal.getByText('npm start').first()).toBeVisible({ timeout: 10000 });
    // The fixture does not listen on a port, so clear the detected port
    // (readiness is skipped when no port is configured — the project goes
    // straight to Running instead of waiting 30s for a port that never opens).
    // The advanced fields are collapsed until "Advanced Settings" is toggled.
    await modal.getByRole('button', { name: 'Advanced Settings' }).click();
    await modal.getByPlaceholder('No port monitoring').first().fill('');
    await modal.getByRole('button', { name: 'Add Project', exact: true }).click();

    // Card appears on the dashboard
    const card = window.locator('article', { hasText: 'e2e-fixture' });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.getByText('Stopped')).toBeVisible({ timeout: 10000 });

    // --- Start ---
    await card.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(card.getByText('Running')).toBeVisible({ timeout: 20000 });

    // Dashboard "Recent Logs" picks up the fixture's output
    await expect(window.getByText('[e2e] tick').first()).toBeVisible({ timeout: 15000 });

    // --- Open the project detail -> Terminal tab shows the full log stream ---
    await card.getByText('e2e-fixture').click();
    await expect(window.getByRole('button', { name: 'Back to Projects' })).toBeVisible({ timeout: 10000 });
    await window.getByRole('tab', { name: 'Terminal' }).click();
    await expect(window.getByText('fixture started').first()).toBeVisible({ timeout: 10000 });
    await expect(window.getByText('[e2e] tick 1').first()).toBeVisible({ timeout: 10000 });

    // --- Stop (ProjectDetail header) ---
    await window.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(window.getByRole('button', { name: 'Start Project', exact: true })).toBeVisible({ timeout: 20000 });

    await app.close();
  });

  test('persists settings across an app restart', async () => {
    const userData = await makeTempDir('devlauncher-settings-');

    // --- First launch: switch the theme to light ---
    const first = await launchApp({ DEVLAUNCHER_USER_DATA: userData });
    const settingsNav = first.window.getByRole('button', { name: /settings/i })
      .or(first.window.getByText(/^settings$/i));
    await settingsNav.first().click();
    await expect(first.window.locator('#themeLightCard')).toBeVisible({ timeout: 10000 });
    await first.window.locator('#themeLightCard').click();
    // The light card is now selected (accent border)
    await expect(first.window.locator('#themeLightCard')).toHaveClass(/border-accent/, { timeout: 10000 });
    // Config is written to disk
    await expect.poll(() => {
      try {
        const raw = fs.readFileSync(path.join(userData, 'config.json'), 'utf8');
        return JSON.parse(raw).theme;
      } catch {
        return null;
      }
    }).toBe('light');
    await first.app.close();

    // --- Second launch: the light theme is still selected ---
    const second = await launchApp({ DEVLAUNCHER_USER_DATA: userData });
    const settingsNav2 = second.window.getByRole('button', { name: /settings/i })
      .or(second.window.getByText(/^settings$/i));
    await settingsNav2.first().click();
    await expect(second.window.locator('#themeLightCard')).toHaveClass(/border-accent/, { timeout: 10000 });
    await second.app.close();
  });
});
