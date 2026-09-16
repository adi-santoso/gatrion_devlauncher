const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { launchApp, makeTempDir, seedUserData, fixtureProject } = require('./helpers');

test('Project Detail retains drafts, isolates tabs, completes tasks, and fits a short Indonesian window', async () => {
  const root = await makeTempDir('detail-regression-');
  const userData = await makeTempDir('detail-data-');
  const a = path.join(root, 'a');
  const b = path.join(root, 'b');
  for (const dir of [a, b]) {
    await fs.promises.mkdir(dir);
    await fs.promises.writeFile(path.join(dir, '.env'), `PROJECT=${path.basename(dir)}`);
    await fs.promises.writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: { build: 'node -e "process.exit(0)"' } }));
  }
  await seedUserData(userData, { projects: [
    fixtureProject('a', a, { name: 'Alpha Laravel', type: 'LARAVEL', port: null }),
    fixtureProject('b', b, { name: 'Beta Node', port: null }),
  ], config: { language: 'id', theme: 'light', sidebarExpanded: true, minimizeToTray: false } });
  let app;
  try {
    const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData });
    app = launched.app;
    const window = launched.window;
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(800, 500); win.setContentSize(1024, 600); });
    await window.getByText('Alpha Laravel', { exact: true }).first().click();
    await expect(window.getByRole('tab', { name: 'Aplikasi' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await window.getByRole('tab', { name: 'Environment', exact: true }).click();
    await window.getByRole('button', { name: 'Edit', exact: true }).click();
    await window.getByRole('textbox', { name: 'Edit .env' }).fill('DRAFT=alpha');
    await expect(window.getByRole('button', { name: 'production', exact: true })).toBeDisabled();
    await window.getByRole('button', { name: 'Kembali ke Proyek' }).click();
    await window.getByText('Beta Node', { exact: true }).filter({ visible: true }).first().click();
    await expect(window.getByRole('tab', { name: 'Aplikasi' })).toHaveAttribute('aria-selected', 'true');
    await expect(window.getByRole('tab', { name: 'Log', exact: true })).toHaveCount(0);
    await window.getByRole('tab', { name: 'Environment', exact: true }).click();
    await expect(window.getByLabel('Isi .env').filter({ visible: true })).toContainText('PROJECT=b');
    await window.getByRole('button', { name: 'Kembali ke Proyek' }).click();
    await window.getByText('Alpha Laravel', { exact: true }).filter({ visible: true }).first().click();
    await expect(window.getByRole('textbox', { name: 'Edit .env' })).toHaveValue('DRAFT=alpha');
    await window.getByRole('tab', { name: 'Aplikasi' }).click();
    await window.getByTitle('Buka/tutup Layar Penuh').filter({ visible: true }).click();
    await window.getByTitle('Keluar layar penuh (ESC)').click();
    await window.getByRole('tab', { name: 'Environment', exact: true }).click();
    await expect(window.getByRole('textbox', { name: 'Edit .env' })).toHaveValue('DRAFT=alpha');
    await window.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect.poll(() => fs.promises.readFile(path.join(a, '.env'), 'utf8')).toBe('DRAFT=alpha');
    expect(await fs.promises.readFile(path.join(b, '.env'), 'utf8')).toBe('PROJECT=b');

    await window.getByRole('tab', { name: 'Skrip' }).click();
    await window.getByRole('button', { name: 'Jalankan', exact: true }).click();
    await expect(window.getByRole('status').filter({ hasText: 'berhasil · exit 0' })).toBeVisible({ timeout: 15000 });
    await expect(window.getByRole('button', { name: 'Hentikan', exact: true })).toHaveCount(0);
    await window.getByRole('tab', { name: 'Pengaturan' }).click();
    await window.getByRole('button', { name: 'Edit Proyek', exact: true }).click();
    await window.getByRole('button', { name: '+ Tambah variabel', exact: true }).click();
    const key = window.getByRole('textbox', { name: 'Nama variabel 1' });
    await key.pressSequentially('FOO_LONG_KEY', { delay: 15 });
    await expect(key).toHaveValue('FOO_LONG_KEY');
    await expect(key).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(window.getByRole('dialog')).toHaveCount(0);
    await window.getByRole('tab', { name: 'Pengaturan' }).focus();
    await window.keyboard.press('Home');
    await expect(window.getByRole('tab', { name: 'Aplikasi' })).toBeFocused();
  } finally {
    if (app) {
      const pid = app.process().pid;
      if (pid && process.platform === 'win32') {
        try { require('child_process').execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already closed */ }
      }
      try { app.process().kill('SIGKILL'); } catch { /* already closed */ }
    }
  }
});
