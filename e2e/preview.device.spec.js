const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { launchApp, makeTempDir, seedUserData, fixtureProject } = require('./helpers');

async function getFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function writePreviewProject(dir, port) {
  const startJs = `const http = require('http');
http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#00cc44"><h1>PREVIEW-FIXTURE</h1></body></html>');
}).listen(${port}, '127.0.0.1', () => console.log('[e2e] preview server on :${port}'));
`;
  await fs.promises.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'e2e-preview', private: true, scripts: { start: 'node start.js' } }, null, 2),
  );
  await fs.promises.writeFile(path.join(dir, 'start.js'), startJs);
  return dir;
}

/**
 * Width of the element whose bounds drive the native WebContentsView — the
 * device-sized screen (device mode) or the full preview area (fit mode).
 */
async function screenWidth(window) {
  return window.evaluate(() => {
    const el = document.querySelector('[aria-label^="Native preview"]');
    const screen = el ? el.parentElement : null;
    return screen ? Math.round(screen.getBoundingClientRect().width) : -1;
  });
}

test.describe('preview device simulator', () => {
  test('selecting a preset resizes the embedded viewport, rotate swaps it, Fit restores', async () => {
    const port = await getFreePort();
    const projectDir = await writePreviewProject(await makeTempDir('devlauncher-previewdev-'), port);
    const userData = await makeTempDir('devlauncher-previewdevdata-');
    const project = fixtureProject('preview-dev', projectDir, { name: 'e2e-preview', port });
    // minimizeToTray must be off so app.close() in teardown does not hang.
    await seedUserData(userData, { projects: [project], config: { minimizeToTray: false } });

    let app = null;
    try {
      const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData });
      app = launched.app;
      const { window } = launched;

      // Open project detail (App tab is default) and start the project.
      await window.getByText('e2e-preview').first().click();
      await expect(window.getByRole('button', { name: 'Back to Projects' })).toBeVisible({ timeout: 10000 });
      await window.getByRole('button', { name: 'Start Project' }).first().click();
      await expect(window.getByRole('button', { name: 'Stop', exact: true })).toBeVisible({ timeout: 20000 });

      // Default: Fit to window fills the preview area.
      const device = window.getByLabel('Device');
      await expect(device).toBeEnabled({ timeout: 10000 });
      await expect.poll(() => screenWidth(window), { timeout: 10000 }).toBeGreaterThan(500);

      const nativeState = () => app.evaluate(async ({ webContents }, port) => {
        const contents = webContents.getAllWebContents().find(contents => contents.getURL().includes(`:${port}`));
        if (!contents) return null;
        return { zoom: contents.getZoomFactor(), ...await contents.executeJavaScript('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })') };
      }, port);
      await window.getByLabel('Zoom', { exact: true }).selectOption('150');
      await expect.poll(async () => (await nativeState())?.zoom).toBe(1.5);
      await window.getByLabel('Zoom', { exact: true }).selectOption('100');
      await expect.poll(async () => (await nativeState())?.zoom).toBe(1);

      // Pick the iPhone SE preset: the viewport shrinks to the device size and
      // the label pill appears above the simulated screen.
      await device.selectOption('iphone-se');
      await expect(window.getByText(/iPhone SE · 375 × 667/)).toBeVisible({ timeout: 10000 });
      await expect.poll(() => screenWidth(window), {
        timeout: 10000,
        message: 'device viewport should be 375 CSS px wide (true media-query target)',
      }).toBe(375);
      await expect.poll(async () => (await nativeState())?.width).toBe(375);
      await expect.poll(async () => (await nativeState())?.dpr).toBe(2);

      // A short fullscreen window must clip the surface, not resize the page.
      await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(800, 500); win.setContentSize(1024, 600); });
      await window.getByRole('button', { name: 'Toggle Fullscreen' }).click();
      await expect(window.getByTitle('Exit fullscreen (ESC)')).toBeVisible();
      await expect.poll(async () => (await nativeState())?.height).toBe(667);
      await expect.poll(() => window.evaluate(() => {
        const viewport = document.querySelector('[data-preview-viewport]');
        const screen = document.querySelector('[aria-label^="Native preview"]').parentElement;
        return screen.getBoundingClientRect().top >= viewport.getBoundingClientRect().top;
      })).toBe(true);
      await window.locator('[data-preview-viewport]').evaluate(el => { el.scrollTop = 140; el.dispatchEvent(new Event('scroll')); });
      await expect.poll(async () => (await nativeState())?.height).toBe(667);
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const container = BrowserWindow.getAllWindows()[0].contentView.children.find(view => !view.webContents && view.children.some(child => child.webContents));
        return container?.children[0].getBounds().y;
      })).toBeLessThan(0);
      await window.getByRole('button', { name: 'Clear site data (cookies, storage) for this project' }).click();
      await expect(window.getByRole('status')).toHaveText('Site data cleared');
      await window.getByTitle('Exit fullscreen (ESC)').click();

      // Rotate: portrait -> landscape swaps the dimensions.
      await window.getByLabel('Rotate (portrait/landscape)').click();
      await expect(window.getByText(/iPhone SE · 667 × 375/)).toBeVisible({ timeout: 10000 });
      await expect.poll(() => screenWidth(window), { timeout: 10000 }).toBe(667);

      // Reload still works while a device is emulated.
      await window.getByRole('button', { name: 'Reload preview' }).click();

      // Fit to window: the pill (only pill text carries the "· dims" suffix,
      // so the select's own "iPhone SE" option does not match) disappears and
      // the view fills the area again.
      await device.selectOption({ label: 'Fit to window' });
      await expect(window.getByText(/iPhone SE ·/)).toHaveCount(0, { timeout: 10000 });
      await expect.poll(() => screenWidth(window), { timeout: 10000 }).toBeGreaterThan(500);

      await device.selectOption('laptop-1366');
      await window.getByLabel('Rotate (portrait/landscape)').click();
      await expect.poll(async () => (await nativeState())?.width).toBe(1366);
      await device.selectOption({ label: 'Fit to window' });

      // Stop the project so the app shuts down cleanly.
      await window.getByRole('button', { name: 'Stop', exact: true }).click();
    } finally {
      // Never await graceful app.close(): before-quit stops every project
      // process before exiting, which can hang teardown indefinitely.
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
