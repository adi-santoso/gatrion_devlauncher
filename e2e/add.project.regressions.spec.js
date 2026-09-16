const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { APP_ROOT, launchApp, makeTempDir, seedUserData, writeFixtureProject } = require('./helpers');

async function stop(app) {
  if (!app) return;
  const pid = app.process().pid;
  if (pid && process.platform === 'win32') {
    try { require('child_process').execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already closed */ }
  }
  try { app.process().kill('SIGKILL'); } catch { /* already closed */ }
}

for (const variant of [{ lang: 'en', theme: 'dark', width: 1440, height: 900 }, { lang: 'id', theme: 'light', width: 1024, height: 600 }]) {
  // eslint-disable-next-line no-empty-pattern -- Electron uses its own window rather than a browser fixture.
  test(`Add Project saves, validates and fits ${variant.lang} ${variant.width}x${variant.height}`, async ({}, info) => {
    const userData = await makeTempDir('add-regression-data-');
    const dir = await writeFixtureProject(await makeTempDir('add-regression-project-'));
    await seedUserData(userData, { config: { language: variant.lang, theme: variant.theme, sidebarExpanded: true, minimizeToTray: false } });
    let app;
    try {
      const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData, DEVLAUNCHER_TEST_FOLDER: dir });
      app = launched.app;
      const win = launched.window;
      await app.evaluate(({ BrowserWindow }, size) => { const w = BrowserWindow.getAllWindows()[0]; w.setMinimumSize(800, 500); w.setContentSize(size.width, size.height); }, variant);
      await win.keyboard.press('Control+n');
      const modal = win.locator('#projectModal');
      await expect(modal.getByRole('dialog', { name: /Add Project|Tambah Proyek/ })).toBeVisible();
      await expect(modal.getByRole('button', { name: /Browse Project Folder|Pilih Folder Proyek/ })).toBeFocused();
      await win.screenshot({ path: info.outputPath('01-empty.png') });
      await modal.getByRole('button', { name: /Browse Project Folder|Pilih Folder Proyek/ }).click();
      await expect(modal.locator('#project-command')).toHaveValue('npm start');
      await expect(modal.locator('#project-port')).toHaveValue('');
      await win.screenshot({ path: info.outputPath('02-detected.png') });

      // The native selector owns Escape while its popup is open.
      await modal.locator('#project-type').click();
      await win.keyboard.press('Escape');
      await expect(modal).toBeVisible();
      await modal.getByRole('button', { name: /Advanced Settings|Pengaturan Lanjutan/ }).click();
      await expect(modal.getByRole('button', { name: /Advanced Settings|Pengaturan Lanjutan/ })).toHaveAttribute('aria-expanded', 'true');
      await modal.getByRole('button', { name: /\+ Add variable|\+ Tambah variabel/ }).click();
      const key = modal.getByRole('textbox', { name: /Variable 1 name|Nama variabel 1/ });
      await key.fill('BAD KEY');
      await modal.getByRole('button', { name: /^(Add Project|Tambah Proyek)$/ }).click();
      await expect(key).toHaveAttribute('aria-invalid', 'true');
      await expect(key).toBeFocused();
      await expect(modal.getByRole('alert')).toContainText(variant.lang === 'id' ? 'Gunakan nama variabel' : 'Use a valid');
      await expect(win.locator('#toastContainer').getByRole('alert')).toHaveCount(0);
      await win.screenshot({ path: info.outputPath('03-inline-error.png') });
      await key.fill('GOOD_KEY');
      await expect(modal.getByRole('alert')).toHaveCount(0);
      await modal.getByRole('button', { name: /^(Add Project|Tambah Proyek)$/ }).click();
      await expect(modal.getByRole('status')).toContainText(variant.lang === 'id' ? 'tersimpan' : 'saved');
      await expect.poll(() => fs.promises.readFile(path.join(userData, 'projects.json'), 'utf8').then(JSON.parse)).toHaveLength(1);
      await modal.getByRole('button', { name: /^(Done|Selesai)$/ }).click();
      await expect(modal).toHaveCount(0);

      // Existing folder is identified before submitting; no error-toast stack.
      await win.keyboard.press('Control+n');
      await modal.getByRole('button', { name: /Browse Project Folder|Pilih Folder Proyek/ }).click();
      await expect(modal.getByRole('status').filter({ hasText: /already registered|sudah terdaftar/ })).toBeVisible();
      await modal.locator('#project-name').fill('different-name');
      await modal.getByRole('button', { name: /^(Add Project|Tambah Proyek)$/ }).click();
      await expect(modal.getByRole('alert')).toContainText(variant.lang === 'id' ? 'sudah terdaftar' : 'already registered');
      await expect(modal.locator('#project-path')).toBeFocused();
      expect(await win.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const save = modal.getByRole('button', { name: /^(Add Project|Tambah Proyek)$/ });
      expect(await save.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
      await win.screenshot({ path: info.outputPath('04-duplicate.png') });
      await modal.getByRole('button', { name: /^(Open project|Buka proyek)$/ }).click();
      await expect(modal).toHaveCount(0);
      await expect(win.getByRole('button', { name: /Back to Projects|Kembali ke Proyek/ })).toBeVisible();
    } finally { await stop(app); }
  });
}

// eslint-disable-next-line no-empty-pattern -- Electron uses its own window rather than a browser fixture.
test('Electron drop bridge, canonical duplicate path and long detection summary', async ({}, info) => {
  const userData = await makeTempDir('add-regression-data-');
  const dir = await writeFixtureProject(await makeTempDir('add-regression-project-'));
  let app;
  try {
    const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData, DEVLAUNCHER_TEST_FOLDER: dir });
    app = launched.app;
    const win = launched.window;
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setMinimumSize(800, 500); w.setContentSize(1024, 600); });
    await win.evaluate(() => { const el = document.createElement('input'); el.type = 'file'; el.id = 'regression-file'; document.body.appendChild(el); });
    await win.locator('#regression-file').setInputFiles(path.join(dir, 'package.json'));
    const result = await win.evaluate(() => {
      const file = document.getElementById('regression-file').files[0];
      const dataTransfer = new DataTransfer(); dataTransfer.items.add(file);
      const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
      window.dispatchEvent(event);
      return { path: window.electron.getPathForFile(file), prevented: event.defaultPrevented };
    });
    expect(result.path).toBe(path.join(dir, 'package.json')); expect(result.prevented).toBe(true);
    const modal = win.locator('#projectModal');
    await expect(modal.getByRole('alert')).toContainText('directory');
    // Recovery after a dropped file: choose its directory instead.
    await modal.getByRole('button', { name: 'Change folder' }).click();
    await expect(modal.locator('#project-command')).toHaveValue('npm start');
    await modal.getByRole('button', { name: 'Cancel' }).click();
    const duplicate = await win.evaluate(async ({ absolute, relative }) => {
      const a = await window.electron.addProject({ name: 'absolute', path: absolute, type: 'NODEJS', startCommand: 'npm start', port: null });
      const b = await window.electron.addProject({ name: 'relative', path: relative, type: 'NODEJS', startCommand: 'npm start', port: null });
      return { first: a.success, second: b.success, existingProjectId: b.existingProjectId, firstId: a.project.id };
    }, { absolute: dir, relative: path.relative(APP_ROOT, dir) });
    expect(duplicate.first).toBe(true); expect(duplicate.second).toBe(false); expect(duplicate.existingProjectId).toBe(duplicate.firstId);
    await win.keyboard.press('Control+n');
    await modal.getByRole('button', { name: 'Browse Project Folder' }).click();
    await expect(modal.locator('#project-command')).toHaveValue('npm start');
    const command = 'node ' + 'entry'.repeat(100) + '.js';
    await modal.locator('#project-command').fill(command);
    await modal.locator('#project-command').press('End');
    await expect(modal.locator('#project-command')).toHaveValue(command);
    expect(await win.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await win.screenshot({ path: info.outputPath('05-long-command.png') });
  } finally { await stop(app); }
});
