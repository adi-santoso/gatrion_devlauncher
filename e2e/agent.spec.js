const { test, expect } = require('@playwright/test');
const path = require('path');
const { launchApp, makeTempDir, writeFixtureProject, seedUserData, fixtureProject } = require('./helpers');

const MOCK_RPC = path.join(__dirname, '..', 'tests', 'fixtures', 'mock-omp-rpc.js');

/** Shared setup: launch with the mock agent, navigate to Agent view, start a session. */
async function openAgentChat({ userData }) {
  const { app, window } = await launchApp({
    DEVLAUNCHER_USER_DATA: userData,
    OMP_RPC_MOCK_SCRIPT: MOCK_RPC,
  });
  const agentNav = window.getByRole('button', { name: /agent/i })
    .or(window.getByText(/^agent$/i));
  await agentNav.first().click();
  await expect(window.getByText('Sessions').first()).toBeVisible({ timeout: 10000 });
  await expect(window.getByText('provider ready').first()).toBeVisible({ timeout: 10000 });
  await window.getByText('e2e-fixture').first().click();
  await expect(window.getByRole('button', { name: /new session/i }).first()).toBeVisible({ timeout: 10000 });
  await window.getByRole('button', { name: /new session/i }).first().click();
  const composer = window.getByPlaceholder('Describe a task, ask a question...');
  await expect(composer).toBeVisible({ timeout: 10000 });
  return { app, window, composer };
}

test.describe('agent chat (mock omp)', () => {
  test('creates a session, sends a prompt, streams a reply, and persists token usage', async () => {
    const userData = await makeTempDir('devlauncher-agent-');
    const projectDir = await writeFixtureProject(await makeTempDir('devlauncher-agentproj-'));
    await seedUserData(userData, { projects: [fixtureProject('proj-agent', projectDir)] });

    const { app, window, composer } = await openAgentChat({ userData, projectDir });

    // --- Send a prompt ---
    await composer.fill('Build a login page');
    await composer.press('Enter');

    // The mock streams the reply (with a live "streaming" phase, then commits)
    await expect(window.getByText('Mock reply to: Build a login page').first()).toBeVisible({ timeout: 15000 });

    // Token usage from agent_end (334) is persisted and shown on the session row
    await expect(window.getByText('0.3k tokens').first()).toBeVisible({ timeout: 10000 });

    // Registry on disk holds the usage, so the badge survives restarts
    await expect.poll(async () => {
      const fs = require('fs');
      const path = require('path');
      try {
        const raw = fs.readFileSync(path.join(userData, 'agent-sessions.json'), 'utf8');
        const sessions = Object.values(JSON.parse(raw).projects || {}).flat();
        return sessions.find((s) => s.tokens === 334)?.tokens || null;
      } catch {
        return null;
      }
    }).toBe(334);

    await app.close();
  });

  test('renders an extension UI confirm dialog and completes the turn after the user answers', async () => {
    const userData = await makeTempDir('devlauncher-agent-extui-');
    const projectDir = await writeFixtureProject(await makeTempDir('devlauncher-agentproj-'));
    await seedUserData(userData, { projects: [fixtureProject('proj-extui', projectDir)] });

    const { app, window, composer } = await openAgentChat({ userData, projectDir });

    // The mock emits an extension_ui_request (confirm) before finishing the turn.
    await composer.fill('Approve CONFIRM action');
    await composer.press('Enter');

    // The global OmpExtensionUiModal appears with the mock's confirm request.
    await expect(window.getByText('Mock confirm request').first()).toBeVisible({ timeout: 15000 });
    await expect(window.getByText('Do you approve this action?').first()).toBeVisible({ timeout: 10000 });

    // The modal's buttons are matched scoped + exact: `getByText('Confirm')`
    // un-scoped would also match the user's "Approve CONFIRM ..." chat bubble
    // (case-insensitive substring), which sits behind the modal overlay.
    const modal = window.locator('#ompExtensionUiModal');

    // Cancel first: the turn completes with a "(cancelled)" marker.
    await modal.getByText('Cancel', { exact: true }).click();
    await expect(window.getByText('(cancelled)').first()).toBeVisible({ timeout: 15000 });

    // Ask again and this time Confirm — the turn completes with "(confirmed)".
    await composer.fill('Approve CONFIRM again');
    await composer.press('Enter');
    await expect(window.getByText('Mock confirm request').first()).toBeVisible({ timeout: 15000 });
    await modal.getByText('Confirm', { exact: true }).click();
    await expect(window.getByText('(confirmed)').first()).toBeVisible({ timeout: 15000 });

    await app.close();
  });

  test('renders an extension UI input dialog and feeds the value back to the agent', async () => {
    const userData = await makeTempDir('devlauncher-agent-extinput-');
    const projectDir = await writeFixtureProject(await makeTempDir('devlauncher-agentproj-'));
    await seedUserData(userData, { projects: [fixtureProject('proj-extinput', projectDir)] });

    const { app, window, composer } = await openAgentChat({ userData, projectDir });

    // The mock emits an extension_ui_request (input) before finishing the turn.
    await composer.fill('Reply INPUT please');
    await composer.press('Enter');

    await expect(window.getByText('Mock input request').first()).toBeVisible({ timeout: 15000 });

    const textarea = window.locator('#ompExtensionUiModal textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('my-value');
    await window.locator('#ompExtensionUiModal').getByText('Submit', { exact: true }).click();

    // The mock's reply echoes the submitted value.
    await expect(window.getByText('(input=my-value)').first()).toBeVisible({ timeout: 15000 });

    await app.close();
  });

  test('passive extension UI frames do not interrupt chat with an input dialog', async () => {
    const userData = await makeTempDir('devlauncher-agent-passive-');
    const projectDir = await writeFixtureProject(await makeTempDir('devlauncher-agentproj-'));
    await seedUserData(userData, { projects: [fixtureProject('proj-passive', projectDir)] });

    const { app, window, composer } = await openAgentChat({ userData, projectDir });

    await composer.fill('Run PASSIVE events');
    await composer.press('Enter');

    await expect(window.getByText('Mock passive notification').first()).toBeVisible({ timeout: 10000 });
    await expect(window.locator('#ompExtensionUiModal')).toHaveCount(0);
    await expect(window.getByText('Mock reply to: Run PASSIVE events').first()).toBeVisible({ timeout: 15000 });

    await app.close();
  });

  test('stopping an agent closes a pending request without opening a cancel dialog', async () => {
    const userData = await makeTempDir('devlauncher-agent-stop-ui-');
    const projectDir = await writeFixtureProject(await makeTempDir('devlauncher-agentproj-'));
    await seedUserData(userData, { projects: [fixtureProject('proj-stop-ui', projectDir)] });

    const { app, window, composer } = await openAgentChat({ userData, projectDir });

    await composer.fill('Wait for CONFIRM before stop');
    await composer.press('Enter');
    await expect(window.getByText('Mock confirm request').first()).toBeVisible({ timeout: 15000 });

    // The modal intentionally covers the header, so invoke the same Stop
    // button handler directly to reproduce an abort racing with a UI request.
    await window.getByRole('button', { name: 'Stop', exact: true }).evaluate((button) => button.click());

    await expect(window.locator('#ompExtensionUiModal')).toHaveCount(0, { timeout: 10000 });
    await expect(window.getByText('Agent needs your input')).toHaveCount(0);

    await app.close();
  });

  test('auto-restarts the RPC process when it crashes mid-turn and recovers', async () => {
    const userData = await makeTempDir('devlauncher-agent-crash-');
    const projectDir = await writeFixtureProject(await makeTempDir('devlauncher-agentproj-'));
    await seedUserData(userData, { projects: [fixtureProject('proj-crash', projectDir)] });

    const { app, window, composer } = await openAgentChat({ userData, projectDir });

    // The mock emits agent_start then exits(1) — triggering auto-restart.
    await composer.fill('Trigger CRASH now');
    await composer.press('Enter');

    // The renderer surfaces the restarting notice.
    await expect(window.getByText(/restarting in/).first()).toBeVisible({ timeout: 10000 });

    // After restart, a fresh prompt works again (the new RPC process is ready).
    await expect(composer).toBeVisible({ timeout: 15000 });
    await composer.fill('Hello after restart');
    await composer.press('Enter');
    await expect(window.getByText('Mock reply to: Hello after restart').first()).toBeVisible({ timeout: 20000 });

    await app.close();
  });
});
