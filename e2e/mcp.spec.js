const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { launchApp, makeTempDir, seedUserData, fixtureProject } = require('./helpers');

/**
 * End-to-end MCP: a real MCP client (plain HTTP/JSON-RPC via Node fetch —
 * exactly what omp does against ~/.omp/agent/mcp.json) talks to the MCP
 * server running inside the live DevLauncher app.
 *
 * The app starts its MCP server when `agent.controlEnabled` is on and writes
 * the endpoint + bearer token to DEVLAUNCHER_OMP_CONFIG_DIR/mcp.json; the
 * test reads that file to discover url + token, then drives the whole flow:
 * handshake → tools/list → read tool → write tool → destructive tool with the
 * approval modal (deny, then approve).
 */

const MCP_CONFIG_POLL_MS = 250;
const MCP_CONFIG_TIMEOUT_MS = 20000;

async function mcpRequest(url, token, method, params = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

/** Wait until the app has written its omp mcp config (server is listening). */
async function discoverMcp(mcpConfigPath) {
  const deadline = Date.now() + MCP_CONFIG_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const raw = fs.readFileSync(mcpConfigPath, 'utf8');
      const entry = JSON.parse(raw).mcpServers.devlauncher;
      if (entry && entry.url && entry.headers?.Authorization) {
        return { url: entry.url, token: entry.headers.Authorization.replace(/^Bearer /, '') };
      }
    } catch { /* not written yet */ }
    await new Promise((resolve) => setTimeout(resolve, MCP_CONFIG_POLL_MS));
  }
  throw new Error(`MCP config was never written to ${mcpConfigPath}`);
}

async function launchWithMcp({ config = {}, projectPath = null } = {}) {
  const userData = await makeTempDir('devlauncher-mcp-');
  const ompDir = await makeTempDir('devlauncher-ompcfg-');
  await seedUserData(userData, {
    projects: projectPath ? [fixtureProject('proj-mcp', projectPath)] : [],
    config: {
      ...config,
      agent: { controlEnabled: true, permissions: { read: true, write: true, destructive: true }, ...config.agent },
    },
  });
  const { app, window } = await launchApp({
    DEVLAUNCHER_USER_DATA: userData,
    DEVLAUNCHER_OMP_CONFIG_DIR: ompDir,
  });
  const { url, token } = await discoverMcp(path.join(ompDir, 'mcp.json'));
  return { app, window, url, token, userData };
}

test.describe('MCP server end-to-end (real client)', () => {
  test('handshake, read and write tools work without approval', async () => {
    const projectDir = await makeTempDir('devlauncher-mcpproj-');
    const { app, url, token } = await launchWithMcp({ projectPath: projectDir });

    // Handshake mirrors what omp sends (2025-11-25).
    const init = await mcpRequest(url, token, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'e2e-client', version: '1.0.0' },
    });
    expect(init.result.serverInfo.name).toBe('devlauncher');
    expect(init.result.capabilities.tools).toEqual({});

    // tools/list exposes the full registry.
    const list = await mcpRequest(url, token, 'tools/list');
    const names = list.result.tools.map((t) => t.name);
    expect(names).toContain('devlauncher_list_projects');
    expect(names).toContain('devlauncher_start_project');
    expect(names).toContain('devlauncher_delete_project');
    expect(names).toContain('devlauncher_update_download_install');

    // Read tool — sees the seeded project.
    const read = await mcpRequest(url, token, 'tools/call', {
      name: 'devlauncher_list_projects',
      arguments: {},
    });
    expect(read.result.isError).toBe(false);
    expect(JSON.parse(read.result.content[0].text)[0].id).toBe('proj-mcp');

    // Write tool — runs without a modal, audited in the activity feed.
    const write = await mcpRequest(url, token, 'tools/call', {
      name: 'devlauncher_append_activity',
      arguments: { message: 'e2e MCP write' },
    });
    expect(write.result.isError).toBe(false);

    await app.close();
  });

  test('destructive tool shows the approval modal — deny cancels, approve runs', async () => {
    const projectDir = await makeTempDir('devlauncher-mcpproj-');
    const { app, window, url, token } = await launchWithMcp({ projectPath: projectDir });

    // ── Deny path ──────────────────────────────────────────────────────────
    const deniedCall = mcpRequest(url, token, 'tools/call', {
      name: 'devlauncher_delete_project',
      arguments: { projectId: 'proj-mcp' },
    });
    // The modal appears in the renderer while the HTTP call is parked.
    await expect(window.getByText('Agent action needs your approval')).toBeVisible({ timeout: 15000 });
    await window.getByRole('button', { name: 'Deny' }).click();

    const denied = await deniedCall;
    expect(denied.result.isError).toBe(true);
    expect(denied.result.content[0].text).toMatch(/menolak/i);

    // Project still exists.
    const afterDeny = await mcpRequest(url, token, 'tools/call', {
      name: 'devlauncher_list_projects',
      arguments: {},
    });
    expect(JSON.parse(afterDeny.result.content[0].text)).toHaveLength(1);

    // ── Approve path ───────────────────────────────────────────────────────
    const approvedCall = mcpRequest(url, token, 'tools/call', {
      name: 'devlauncher_delete_project',
      arguments: { projectId: 'proj-mcp' },
    });
    await expect(window.getByText('Agent action needs your approval')).toBeVisible({ timeout: 15000 });
    await window.getByRole('button', { name: 'Approve' }).click();

    const approved = await approvedCall;
    expect(approved.result.isError).toBe(false);
    expect(JSON.parse(approved.result.content[0].text).deleted).toBe('proj-mcp');

    // Project is gone from the workspace.
    const afterApprove = await mcpRequest(url, token, 'tools/call', {
      name: 'devlauncher_list_projects',
      arguments: {},
    });
    expect(JSON.parse(afterApprove.result.content[0].text)).toHaveLength(0);

    await app.close();
  });

  test('disabled permission category rejects tools at the MCP boundary', async () => {
    const { app, url, token } = await launchWithMcp({
      config: { agent: { permissions: { read: false, write: true, destructive: true } } },
    });

    const read = await mcpRequest(url, token, 'tools/call', {
      name: 'devlauncher_list_projects',
      arguments: {},
    });
    expect(read.result.isError).toBe(true);
    expect(read.result.content[0].text).toMatch(/read tools are disabled/i);

    // Unaffected category still works.
    const write = await mcpRequest(url, token, 'tools/call', {
      name: 'devlauncher_append_activity',
      arguments: { message: 'still works' },
    });
    expect(write.result.isError).toBe(false);

    await app.close();
  });
});
