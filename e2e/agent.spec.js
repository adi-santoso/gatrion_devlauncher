const { test, expect } = require('@playwright/test');
const path = require('path');
const { launchApp, makeTempDir, writeFixtureProject, seedUserData, fixtureProject } = require('./helpers');

const MOCK_RPC = path.join(__dirname, '..', 'tests', 'fixtures', 'mock-omp-rpc.js');

test.describe('agent chat (mock omp)', () => {
  test('creates a session, sends a prompt, streams a reply, and persists token usage', async () => {
    const userData = await makeTempDir('devlauncher-agent-');
    const projectDir = await writeFixtureProject(await makeTempDir('devlauncher-agentproj-'));
    await seedUserData(userData, { projects: [fixtureProject('proj-agent', projectDir)] });

    const { app, window } = await launchApp({
      DEVLAUNCHER_USER_DATA: userData,
      OMP_RPC_MOCK_SCRIPT: MOCK_RPC,
    });

    // --- Navigate to the Agent view ---
    const agentNav = window.getByRole('button', { name: /agent/i })
      .or(window.getByText(/^agent$/i));
    await agentNav.first().click();
    await expect(window.getByText('Sessions').first()).toBeVisible({ timeout: 10000 });

    // The mock agent reports as installed + provider ready
    await expect(window.getByText('provider ready').first()).toBeVisible({ timeout: 10000 });

    // --- Expand the project -> start a new session ---
    await window.getByText('e2e-fixture').first().click();
    await expect(window.getByRole('button', { name: /new session/i }).first()).toBeVisible({ timeout: 10000 });
    await window.getByRole('button', { name: /new session/i }).first().click();

    const composer = window.getByPlaceholder('Describe a task, ask a question…');
    await expect(composer).toBeVisible({ timeout: 10000 });

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
});
