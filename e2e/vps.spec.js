const { test, expect } = require('@playwright/test');
const { launchApp, makeTempDir, seedUserData } = require('./helpers');
const { createSshFixture } = require('../tests/fixtures/ssh-server');
const path = require('path');

/**
 * VPS Command Center end-to-end against the in-process SSH fixture.
 *
 * The fixture runs inside the Playwright (Node) process; the app's main process
 * connects to it over real TCP. No real host, key, or credential is involved.
 * Covers F1/F2 acceptance: add server → test connection → review + trust host
 * key → connect → overview/services/logs from the remote → disconnect.
 */
test.describe('VPS command center', () => {
  test('enabling Agent control opens an existing VPS session without duplicating it', async () => {
    const fixture = await createSshFixture();
    const userData = await makeTempDir('vps-session-enable-');
    await seedUserData(userData, { projects: [], config: { language: 'en', agent: { controlEnabled: false } } });
    const { app, window } = await launchApp({
      DEVLAUNCHER_USER_DATA: userData,
      DEVLAUNCHER_VPS_CONTEXT_DIR: path.join(userData, 'vps-context'),
      OMP_RPC_MOCK_SCRIPT: path.join(__dirname, '..', 'tests', 'fixtures', 'mock-omp-rpc.js'),
      OMP_RPC_MOCK_PERSIST_HISTORY: '1',
    });
    try {
      const id = await window.evaluate(async ({ port, key }) => {
        const input = { name: 'Session fixture', host: '127.0.0.1', port, username: 'fixture', environment: 'development', policy: 'controlled', authKind: 'key' };
        const secret = { kind: 'key', privateKey: key };
        const added = await window.electron.vpsAddServer(input, secret);
        const probe = await window.electron.vpsTestConnection(input, secret);
        await window.electron.vpsConnect(added.server.id, probe.result.hostKey.fingerprint);
        await window.electron.ompCreateSession(`vps:${added.server.id}`, 'Existing VPS session');
        return added.server.id;
      }, { port: fixture.port, key: fixture.clientPrivateKey });
      await window.getByRole('button', { name: 'VPS', exact: true }).click();
      const modes = window.getByRole('combobox', { name: 'Agent policy', exact: true });
      await modes.selectOption('auto');
      await expect(modes).toHaveValue('auto');
      await modes.selectOption('full-access');
      await expect(modes).toHaveValue('full-access');
      await expect.poll(async () => (await window.evaluate(() => window.electron.vpsListServers())).servers.find((server) => server.id === id).policy).toBe('full-access');
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1800, 1000));
      const divider = window.getByRole('separator', { name: 'Resize agent panel' });
      await expect(divider).toBeVisible();
      const startWidth = Number(await divider.getAttribute('aria-valuenow'));
      const handle = await divider.boundingBox();
      await window.mouse.move(handle.x + handle.width / 2, handle.y + 100);
      await window.mouse.down();
      await window.mouse.move(handle.x + handle.width / 2 - 120, handle.y + 100, { steps: 8 });
      await window.mouse.up();
      await expect(divider).toHaveAttribute('aria-valuenow', String(startWidth + 120));
      await expect.poll(() => window.evaluate(() => localStorage.getItem('vps-chat-width'))).toBe(String(startWidth + 120));
      await divider.focus();
      await window.keyboard.press('ArrowRight');
      await expect(divider).toHaveAttribute('aria-valuenow', String(startWidth + 96));
      await divider.dblclick();
      await expect(divider).toHaveAttribute('aria-valuenow', '460');
      await window.getByRole('button', { name: 'Focus chat', exact: true }).click();
      await expect(divider).toHaveCount(0);
      await expect(window.getByText('Enable Agent control to use VPS chat. Existing sessions will be preserved.')).toBeVisible();
      await expect(window.getByRole('button', { name: 'New session', exact: true })).toBeDisabled();
      await window.getByRole('button', { name: 'Enable Agent control', exact: true }).click();
      await expect(window.getByRole('textbox', { name: 'Message to agent', exact: true })).toBeVisible({ timeout: 20000 });
      const sessions = await window.evaluate((serverId) => window.electron.ompListSessions(`vps:${serverId}`), id);
      expect(sessions.sessions).toHaveLength(1);
      const composer = window.getByRole('textbox', { name: 'Message to agent', exact: true });
      await composer.fill('VPS_HISTORY_RECONNECT');
      await composer.press('Enter');
      await expect(window.getByText('Mock reply to: VPS_HISTORY_RECONNECT', { exact: true })).toBeVisible();
      await expect.poll(async () => (await window.evaluate((serverId) => window.electron.ompListSessions(`vps:${serverId}`), id)).sessions[0].sessionPath).toBeTruthy();
      await window.getByRole('button', { name: 'Disconnect', exact: true }).click();
      await expect(composer).toHaveCount(0);
      await window.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(window.getByText('Mock reply to: VPS_HISTORY_RECONNECT', { exact: true })).toBeVisible({ timeout: 20000 });
      await window.getByRole('button', { name: 'New session', exact: true }).click();
      await expect(window.getByRole('combobox', { name: 'Session', exact: true })).not.toHaveValue(sessions.sessions[0].id);
      await window.getByRole('combobox', { name: 'Session', exact: true }).selectOption(sessions.sessions[0].id);
      await expect(window.getByText('Mock reply to: VPS_HISTORY_RECONNECT', { exact: true })).toBeVisible();
      await window.getByRole('button', { name: 'Delete session', exact: true }).click();
      await window.getByRole('button', { name: 'Confirm delete', exact: true }).click();
      await expect(window.getByRole('alertdialog')).toHaveCount(0);
      await expect.poll(async () => (await window.evaluate((serverId) => window.electron.ompListSessions(`vps:${serverId}`), id)).sessions.length).toBe(1);
    } finally {
      await app.close().catch(() => {});
      await fixture.close();
    }
  });
  test('add server, trust host key, connect and read remote data', async () => {
    const fixture = await createSshFixture();
    const userData = await makeTempDir('devlauncher-vps-e2e-');
    await seedUserData(userData, { projects: [], config: { language: 'en' } });
    const { app, window } = await launchApp({
      DEVLAUNCHER_USER_DATA: userData,
      DEVLAUNCHER_VPS_CONTEXT_DIR: `${userData}/vps-context`,
    });

    try {
      // 1. Open the VPS menu and add a server.
      await window.getByRole('button', { name: 'VPS', exact: true }).click();
      await window.getByRole('button', { name: 'Add VPS' }).first().click();

      await window.locator('#vps-name').fill('e2e-fixture');
      await window.locator('#vps-host').fill('127.0.0.1');
      await window.locator('#vps-port').fill(String(fixture.port));
      await window.locator('#vps-username').fill('fixture');
      await window.locator('#vps-default-cwd').fill('/var/www/app');
      await window.locator('#vps-private-key').fill(fixture.clientPrivateKey);

      // 2. Test connection: the observed host key is surfaced, not auto-trusted.
      await window.getByRole('button', { name: 'Test connection' }).click();
      await expect(window.getByRole('status')).toContainText('SSH host reachable');
      await expect(window.getByRole('status')).toContainText('SHA256:');

      // 3. Save and connect — the unknown host key must be reviewed first.
      await window.getByRole('button', { name: 'Save' }).click();
      await expect(window.getByRole('button', { name: /e2e-fixture/ }).first()).toBeVisible();
      // `exact` matters: the server row's accessible name contains "Disconnected".
      await window.getByRole('button', { name: 'Connect', exact: true }).click();

      await expect(window.getByRole('dialog')).toContainText('Verify host key');
      await expect(window.getByRole('dialog')).toContainText('SHA256:');
      await window.getByRole('button', { name: 'Trust and connect' }).click();

      // 4. Connected + overview data comes from the remote probe.
      await expect(window.getByText('Connected', { exact: true }).first()).toBeVisible({ timeout: 20000 });
      await expect(window.getByText('fixture-host')).toBeVisible({ timeout: 20000 });
      await expect(window.getByText('Fixture Linux 1.0')).toBeVisible();
      await window.screenshot({ path: 'test-results/vps-audit-dark.png' });
      await window.evaluate(() => window.electron.updateConfig({ theme: 'light' }));
      await expect(window.locator('html')).toHaveAttribute('data-theme', 'light');
      await window.screenshot({ path: 'test-results/vps-audit-light.png' });
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
      await window.getByRole('button', { name: 'Focus chat', exact: true }).click();
      await expect(window.getByRole('button', { name: 'Show detail', exact: true })).toBeVisible();
      await window.screenshot({ path: 'test-results/vps-audit-narrow.png' });
      await window.getByRole('button', { name: 'Show detail', exact: true }).click();
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 1000));
      await window.evaluate(() => window.electron.updateConfig({ theme: 'dark' }));

      // 5. Services + journald logs (scope to the tab nav vs the row button).
      const detailTabs = window.getByRole('navigation', { name: 'Server detail' });
      await detailTabs.getByRole('button', { name: 'Services', exact: true }).click();
      await expect(window.getByText('nginx.service')).toBeVisible({ timeout: 20000 });
      await window.getByRole('row', { name: /nginx\.service/ }).getByRole('button', { name: 'Logs' }).click();
      await expect(window.getByText('listening on :8080')).toBeVisible({ timeout: 20000 });

      // 6. Remote terminal opens without an error.
      await detailTabs.getByRole('button', { name: 'Terminal', exact: true }).click();
      await expect(window.getByText('SSH terminal')).toBeVisible();
      await expect(window.getByText('Could not open the remote shell')).toHaveCount(0);
      await expect(window.getByText('Connected to the remote shell.')).toBeVisible();
      const oldClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
      try {
        await app.evaluate(({ clipboard }) => clipboard.writeText('VPS_PASTE_CHECK'));
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
        await window.locator('.xterm-screen').click();
        await window.keyboard.type('TYPED_CHECK');
        await expect.poll(() => fixture.shellInputs.join('')).toContain('TYPED_CHECK');
        const shellCount = fixture.shells.length;
        for (const tab of ['Overview', 'Services', 'Logs']) {
          await detailTabs.getByRole('button', { name: tab, exact: true }).click();
          await expect(window.locator('.xterm-screen')).toBeHidden();
          // Output arriving while hidden must also survive the tab switch.
          fixture.shells[shellCount - 1].write(`\r\nBACKGROUND_${tab}\r\n`);
          await detailTabs.getByRole('button', { name: 'Terminal', exact: true }).click();
          await expect(window.getByText(`BACKGROUND_${tab}`, { exact: true })).toBeVisible();
          expect(fixture.shells.length).toBe(shellCount);
        }
        await expect(window.getByText('BACKGROUND_Overview', { exact: true })).toBeVisible();
        await window.locator('.xterm-screen').click();
        await window.keyboard.type('SAME_SHELL_CHECK');
        await expect.poll(() => fixture.shellInputs.join('')).toContain('SAME_SHELL_CHECK');
        await expect.poll(() => window.evaluate(() => navigator.clipboard.readText())).toBe('VPS_PASTE_CHECK');
        await window.keyboard.press('Control+v');
        await expect.poll(() => fixture.shellInputs.join('')).toContain('VPS_PASTE_CHECK');
        await window.keyboard.press('Control+c');
        await expect.poll(() => fixture.shellInputs.join('')).toContain('\x03');
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 850));
        await expect.poll(() => fixture.shellWindows.length).toBeGreaterThan(0);
      } finally { await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), oldClipboard); }

      // 7. Disconnect drops the status back to disconnected.
      await window.getByRole('button', { name: 'Disconnect', exact: true }).click();
      await expect(window.getByText('Disconnected', { exact: true }).first()).toBeVisible({ timeout: 20000 });
      await expect(window.locator('.xterm-screen')).toHaveCount(0);
      await window.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(window.getByText('Connected to the remote shell.')).toBeVisible();
      await window.locator('.xterm-screen').click();
      await window.keyboard.type('RECONNECTED_CHECK');
      await expect.poll(() => fixture.shellInputs.join('')).toContain('RECONNECTED_CHECK');
      expect(fixture.shells.length).toBe(2);
      await window.getByRole('button', { name: 'Disconnect', exact: true }).click();

      // The credential never left the main process.
      const registry = await window.evaluate(() => window.electron.vpsListServers());
      expect(JSON.stringify(registry)).not.toContain('PRIVATE KEY');
    } finally {
      await app.close().catch(() => {});
      await fixture.close();
    }
  });

  test('rejects an unknown host key until the user trusts the fingerprint', async () => {
    const fixture = await createSshFixture();
    const userData = await makeTempDir('devlauncher-vps-e2e-');
    await seedUserData(userData, { projects: [], config: { language: 'en' } });
    const { app, window } = await launchApp({
      DEVLAUNCHER_USER_DATA: userData,
      DEVLAUNCHER_VPS_CONTEXT_DIR: `${userData}/vps-context`,
    });

    try {
      await window.getByRole('button', { name: 'VPS', exact: true }).click();
      await window.getByRole('button', { name: 'Add VPS' }).first().click();
      await window.locator('#vps-name').fill('untrusted');
      await window.locator('#vps-host').fill('127.0.0.1');
      await window.locator('#vps-port').fill(String(fixture.port));
      await window.locator('#vps-username').fill('fixture');
      await window.locator('#vps-private-key').fill(fixture.clientPrivateKey);
      await window.getByRole('button', { name: 'Save' }).click();

      await window.getByRole('button', { name: 'Connect', exact: true }).click();
      // Cancelling the review must leave the server disconnected.
      await expect(window.getByRole('dialog')).toContainText('Verify host key');
      await window.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
      await expect(window.getByRole('dialog')).toHaveCount(0);
      await expect(window.getByText('Connected', { exact: true })).toHaveCount(0);
    } finally {
      await app.close().catch(() => {});
      await fixture.close();
    }
  });
});
