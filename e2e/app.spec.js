const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

// CI Linux runners need the Chromium sandbox disabled or Electron aborts at
// launch (no SUID sandbox helper / user namespaces).
const ELECTRON_ARGS = [path.join(__dirname, '..')];
if (process.platform === 'linux' || process.env.CI) {
  ELECTRON_ARGS.unshift('--no-sandbox', '--disable-dev-shm-usage');
}

async function launchApp() {
  const app = await electron.launch({
    args: ELECTRON_ARGS,
    env: { ...process.env, NODE_ENV: 'test' },
  });
  // The app opens DevTools in dev mode; pick the window hosting the Vite renderer.
  let appWindow = null;
  for (let i = 0; i < 20 && !appWindow; i += 1) {
    appWindow = app.windows().find((w) => w.url().startsWith('http://localhost:5173')) || null;
    if (!appWindow) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!appWindow) appWindow = await app.firstWindow();
  await appWindow.waitForLoadState('domcontentloaded');
  // Wait for React to finish hydrating and load projects/config
  await appWindow.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 20000 });
  return { app, window: appWindow };
}

test.describe('Gatrion app', () => {
  test('launches and renders the app shell', async () => {
    const { app, window } = await launchApp();
    // Sidebar brand and workspace header should exist in the DOM
    await expect(window.getByText('Gatrion').first()).toBeVisible({ timeout: 15000 });
    await app.close();
  });

  test('shows workspace dashboard controls', async () => {
    const { app, window } = await launchApp();
    await expect(window.getByText(/workspace/i).first()).toBeAttached({ timeout: 15000 });
    await app.close();
  });

  test('navigates to settings via sidebar', async () => {
    const { app, window } = await launchApp();
    const settingsNav = window.getByRole('button', { name: /settings/i })
      .or(window.getByText(/^settings$/i));
    await settingsNav.first().click();
    await expect(window.getByText(/general|theme/i).first()).toBeVisible({ timeout: 10000 });
    await app.close();
  });

  test('opens the agent view via sidebar', async () => {
    const { app, window } = await launchApp();
    const agentNav = window.getByRole('button', { name: /agent/i })
      .or(window.getByText(/^agent$/i));
    await agentNav.first().click();
    // Agent view renders its sessions panel and chat area
    await expect(window.getByText(/sessions/i).first()).toBeVisible({ timeout: 10000 });
    await expect(window.getByText(/select a project|chat with the coding agent/i).first()).toBeAttached({ timeout: 10000 });
    await app.close();
  });
});
