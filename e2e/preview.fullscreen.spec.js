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
  res.end('<html><body style="margin:0;background:#00cc44"><h1>PREVIEW-FIXTURE</h1></body></html>');
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
 * Height of the native-preview container (containerRef) — the element whose
 * bounds are sent to main to position the WebContentsView. This is the right
 * thing to assert: when the layout height chain collapses (the fullscreen
 * regression), THIS element measures 0 and the view is clamped to 1px. The
 * inner `h-full` placeholder div can legitimately report 0 in normal mode
 * (100% of a flex-grown parent), but the container still has a real height.
 */
async function previewAreaHeight(window) {
  return window.evaluate(() => {
    const el = document.querySelector('[aria-label^="Native preview"]');
    const area = el ? el.parentElement : null;
    return area ? Math.round(area.getBoundingClientRect().height) : -1;
  });
}

test.describe('preview fullscreen', () => {
  // Regression: entering the in-app fullscreen used to collapse the layout
  // height chain (AppProjectDetail wrapper had no height class), so the
  // preview placeholder measured 0px and the embedded view was hidden —
  // a blank/black fullscreen. The placeholder must keep a real height.
  test('fullscreen preview placeholder keeps a non-zero height', async () => {
    const port = await getFreePort();
    const projectDir = await writePreviewProject(await makeTempDir('devlauncher-previewproj-'), port);
    const userData = await makeTempDir('devlauncher-previewfs-');
    const project = fixtureProject('preview-fs', projectDir, { name: 'e2e-preview', port });
    // minimizeToTray defaults to true; without disabling it the window-close
    // just hides to tray and app.close() in teardown would hang forever.
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

      // Normal mode: the preview area (source of the native-view bounds) has height.
      await expect.poll(() => previewAreaHeight(window), {
        timeout: 10000,
        message: 'normal-mode preview area should have height',
      }).toBeGreaterThan(100);

      // Enter the in-app fullscreen preview.
      await window.getByRole('button', { name: 'Toggle Fullscreen' }).click();
      await expect(window.getByRole('button', { name: /exit/i })).toBeVisible({ timeout: 10000 });

      // THE REGRESSION: in fullscreen the preview area must keep a real height
      // (it used to collapse to 0px -> view bounds 0 -> clamped to 1px -> the
      // blank/black fullscreen the user reported).
      await expect.poll(() => previewAreaHeight(window), {
        timeout: 10000,
        message: 'fullscreen preview area should keep a non-zero height (blank/black = bug)',
      }).toBeGreaterThan(100);

      // Exit fullscreen and stop the project so the app shuts down cleanly.
      await window.keyboard.press('Escape');
      await expect(window.getByRole('button', { name: /toggle fullscreen/i })).toBeVisible({ timeout: 10000 });
      await window.getByRole('button', { name: 'Stop', exact: true }).click();
    } finally {
      // Never await graceful app.close() here: before-quit stops every
      // project process (npm/node tree) before exiting, which can hang the
      // worker teardown indefinitely. The test has already verified what it
      // needs — hard-kill the whole process tree so teardown returns at once.
      if (app) {
        const pid = app.process().pid;
        // Kill the whole tree FIRST (main + renderer + npm/node children).
        // Killing the main process alone orphans the project fixture, whose
        // open stdio pipes keep Playwright's worker teardown waiting.
        if (pid && process.platform === 'win32') {
          try { require('child_process').execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* already dead */ }
        }
        try { app.process().kill('SIGKILL'); } catch { /* already dead */ }
      }
    }
  });
});
