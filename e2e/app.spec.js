const { test, expect } = require('@playwright/test');
const { launchApp, makeTempDir, seedUserData } = require('./helpers');

/**
 * Launch with an isolated userData. Without this the app shares the real
 * userData and its single-instance lock, so if an installed DevLauncher is
 * already running the launched instance calls app.quit() at startup
 * ("Target page, context or browser has been closed").
 */
async function launchIsolated() {
  const userData = await makeTempDir('devlauncher-app-');
  // minimizeToTray defaults to true; without disabling it the window-close
  // hides to tray and a graceful app.close() in teardown would hang forever.
  await seedUserData(userData, { config: { minimizeToTray: false } });
  return launchApp({ DEVLAUNCHER_USER_DATA: userData });
}

function killAppTree(app) {
  const pid = app && app.process().pid;
  if (pid && process.platform === 'win32') {
    try { require('child_process').execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* already dead */ }
  }
  try { app && app.process().kill('SIGKILL'); } catch { /* already dead */ }
}

test.describe('Gatrion app', () => {
  test('launches and renders the app shell', async () => {
    let app = null;
    try {
      const launched = await launchIsolated();
      app = launched.app;
      const { window } = launched;
      // Sidebar brand and workspace header should exist in the DOM
      await expect(window.getByText('Gatrion').first()).toBeVisible({ timeout: 15000 });
    } finally {
      killAppTree(app);
    }
  });

  test('shows workspace dashboard controls', async () => {
    let app = null;
    try {
      const launched = await launchIsolated();
      app = launched.app;
      const { window } = launched;
      await expect(window.getByText(/workspace/i).first()).toBeAttached({ timeout: 15000 });
    } finally {
      killAppTree(app);
    }
  });

  test('navigates to settings via sidebar', async () => {
    let app = null;
    try {
      const launched = await launchIsolated();
      app = launched.app;
      const { window } = launched;
      const settingsNav = window.getByRole('button', { name: /settings/i })
        .or(window.getByText(/^settings$/i));
      await settingsNav.first().click();
      await expect(window.getByText(/general|theme/i).first()).toBeVisible({ timeout: 10000 });
    } finally {
      killAppTree(app);
    }
  });

  test('opens the agent view via sidebar', async () => {
    let app = null;
    try {
      const launched = await launchIsolated();
      app = launched.app;
      const { window } = launched;
      const agentNav = window.getByRole('button', { name: /agent/i })
        .or(window.getByText(/^agent$/i));
      await agentNav.first().click();
      // Agent view renders its sessions panel and chat area
      await expect(window.getByText(/sessions/i).first()).toBeVisible({ timeout: 10000 });
      await expect(window.getByText(/select a project|chat with the coding agent/i).first()).toBeAttached({ timeout: 10000 });
    } finally {
      killAppTree(app);
    }
  });
});
