const { test, expect } = require('@playwright/test');
const { launchApp, makeTempDir, seedUserData } = require('./helpers');

test.describe('minimize to tray', () => {
  // Regression: the window-close handler used to be async — it awaited
  // storageManager.loadConfig() before calling event.preventDefault(). Electron
  // does not wait for async close handlers, so the preventDefault came too late:
  // the window closed → window-all-closed → app.quit(). minimize-to-tray was ON
  // (it is the default) but the app always fully quit on close.
  test('closing the window hides to tray instead of quitting', async () => {
    const userData = await makeTempDir('devlauncher-tray-e2e-');
    await seedUserData(userData, { config: { minimizeToTray: true } });

    let app = null;
    try {
      const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData });
      app = launched.app;
      const { window } = launched;

      await window.getByText('Gatrion').first().waitFor({ timeout: 15000 });

      // Close the main window exactly like the user pressing the X button.
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) win.close();
      });

      // The main process must stay alive and the window must be hidden, not
      // destroyed. (Old behavior: window destroyed → count 0 → app quitting.)
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const wins = BrowserWindow.getAllWindows();
        return { count: wins.length, visible: wins.some((w) => w.isVisible()) };
      }), { timeout: 10000, message: 'window should be hidden to tray, app still alive' })
        .toEqual({ count: 1, visible: false });

      // Restore the window so the app can shut down normally afterwards.
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) win.show();
      });
    } finally {
      // The window is hidden to tray, so a graceful app.close() cannot reach a
      // window to trigger quit — hard-kill the whole process tree instead.
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
