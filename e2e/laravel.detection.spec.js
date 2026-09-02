const { test, expect } = require('@playwright/test');
const path = require('path');
const { launchApp, makeTempDir, writeLaravelViteFixture } = require('./helpers');

/**
 * Laravel detection: a Laravel project only gets an additional "Frontend
 * assets" process when vite is genuinely wired to Laravel (laravel-vite-plugin
 * present). A bare vite dependency — common when vite is just a transitive
 * dep — must NOT spawn a second slot, and the user can always remove a
 * detected additional process from the modal.
 */

async function openAddProject(window) {
  await window.getByRole('button', { name: /add project/i }).first().click();
  const modal = window.locator('#projectModal');
  await modal.getByRole('button', { name: /browse project folder/i }).click();
  await expect(modal.getByText(/Detected as Laravel/i).first()).toBeVisible({ timeout: 15000 });
  await modal.getByRole('button', { name: 'Advanced Settings' }).click();
  return modal;
}

test.describe('Laravel + vite detection', () => {
  test('bare vite dependency does not create a Frontend assets slot', async () => {
    const userData = await makeTempDir('devlauncher-lar-bare-');
    const projectDir = await writeLaravelViteFixture(await makeTempDir('devlauncher-larproj-'), { wireVite: false });

    const { app, window } = await launchApp({
      DEVLAUNCHER_USER_DATA: userData,
      DEVLAUNCHER_TEST_FOLDER: projectDir,
    });

    const modal = await openAddProject(window);
    // Only the primary Laravel command is present — no additional process.
    await expect(modal.getByText('Frontend assets')).toHaveCount(0);
    await expect(modal.getByText('php artisan serve').first()).toBeVisible({ timeout: 10000 });

    await app.close();
  });

  test('laravel-vite-plugin wired project gets the assets slot, which can be removed', async () => {
    const userData = await makeTempDir('devlauncher-lar-plugin-');
    const projectDir = await writeLaravelViteFixture(await makeTempDir('devlauncher-larproj-'), { wireVite: true });

    const { app, window } = await launchApp({
      DEVLAUNCHER_USER_DATA: userData,
      DEVLAUNCHER_TEST_FOLDER: projectDir,
    });

    const modal = await openAddProject(window);
    // The wired project detects two slots (Laravel + Frontend assets).
    await expect(modal.getByText('Frontend assets').first()).toBeVisible({ timeout: 10000 });

    // The user can remove the additional process.
    const remove = modal.getByRole('button', { name: /remove additional process/i });
    await remove.click();
    await expect(modal.getByText('Frontend assets')).toHaveCount(0);

    await app.close();
  });
});
