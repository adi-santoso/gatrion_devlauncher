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
const body = (c) => '<html><body style="margin:0;background:#00cc44;font-family:sans-serif"><h1>' + c + '</h1><a id="go2" href="/login">go /login</a></body></html>';
http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  const marker = path === '/login' ? 'LOGIN-PAGE' : 'PREVIEW-ROOT';
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(body(marker));
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
 * Read the marker text rendered by the embedded WebContentsView (reached from
 * the main process: the app's root contentView hosts one child view per
 * project). Falls back to '' when the view/contents aren't reachable.
 */
async function previewMarker(app, port) {
  return app.evaluate(({ BrowserWindow }, port) => {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      const kids = win.contentView?.children || [];
      for (const view of kids) {
        const url = view.webContents?.getURL?.() || '';
        if (url.includes(`:${port}`)) {
          try {
            return view.webContents.executeJavaScript('document.body.innerText')
              .then((t) => String(t || ''));
          } catch {
            return '';
          }
        }
      }
    }
    return Promise.resolve('');
  }, port).then((t) => String(t || ''));
}

/**
 * Persistence regression: navigating the embedded preview away from the app
 * root, then reloading (or tab-switching / toggling fullscreen — anything that
 * re-runs preview-show) must NOT bounce the user back to the initial URL.
 */
test.describe('preview URL persistence', () => {
  test('reload and re-show keep the navigated URL', async () => {
    const port = await getFreePort();
    const projectDir = await writePreviewProject(await makeTempDir('devlauncher-previewpersist-'), port);
    const userData = await makeTempDir('devlauncher-previewpersist-ud-');
    const project = fixtureProject('preview-persist', projectDir, { name: 'e2e-persist', port });
    await seedUserData(userData, { projects: [project], config: { minimizeToTray: false } });

    let app = null;
    try {
      const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData });
      app = launched.app;
      const { window } = launched;

      // Open project detail (App tab is default) and start the project.
      await window.getByText('e2e-persist').first().click();
      await expect(window.getByRole('button', { name: 'Back to Projects' })).toBeVisible({ timeout: 10000 });
      await window.getByRole('button', { name: 'Start Project' }).first().click();
      await expect(window.getByRole('button', { name: 'Stop', exact: true })).toBeVisible({ timeout: 20000 });

      const address = window.getByLabel('Preview address');

      // The preview loads the app root first.
      await expect.poll(() => previewMarker(app, port), { timeout: 15000 }).toContain('PREVIEW-ROOT');
      await expect(address).toHaveValue(`http://localhost:${port}/`, { timeout: 10000 });

      // Navigate away via the address bar (as a dev would to /login).
      await address.fill(`http://localhost:${port}/login`);
      await address.press('Enter');
      await expect.poll(() => previewMarker(app, port), { timeout: 15000 }).toContain('LOGIN-PAGE');
      await expect(address).toHaveValue(`http://localhost:${port}/login`, { timeout: 10000 });

      // Reload preview: must reload the CURRENT page, not the app root.
      await window.getByRole('button', { name: 'Reload preview' }).click();
      await expect.poll(() => previewMarker(app, port), { timeout: 15000 }).toContain('LOGIN-PAGE');
      await expect(address).toHaveValue(`http://localhost:${port}/login`, { timeout: 10000 });

      // Tab switch and back: re-show must preserve the navigated URL.
      await window.getByRole('tab', { name: 'Terminal' }).click();
      await window.getByRole('tab', { name: 'App' }).click();
      await expect.poll(() => previewMarker(app, port), { timeout: 15000 }).toContain('LOGIN-PAGE');
      await expect(address).toHaveValue(`http://localhost:${port}/login`, { timeout: 10000 });

      // Fullscreen toggle and back: the page and address survive.
      await window.getByRole('button', { name: 'Toggle Fullscreen' }).click();
      await expect(window.getByRole('button', { name: /exit/i })).toBeVisible({ timeout: 10000 });
      await expect.poll(() => previewMarker(app, port), { timeout: 15000 }).toContain('LOGIN-PAGE');
      await window.keyboard.press('Escape');
      await expect(window.getByRole('button', { name: /toggle fullscreen/i })).toBeVisible({ timeout: 10000 });
      await expect.poll(() => previewMarker(app, port), { timeout: 15000 }).toContain('LOGIN-PAGE');

      // Back now returns to the root (navigation history was preserved).
      await window.getByRole('button', { name: 'Back', exact: true }).click();
      await expect.poll(() => previewMarker(app, port), { timeout: 15000 }).toContain('PREVIEW-ROOT');

      await window.getByRole('button', { name: 'Stop', exact: true }).click();
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
