#!/usr/bin/env node
/* global document, fetch, setTimeout */
/**
 * Capture real DevLauncher screenshots for the README and landing page.
 *
 * Runs the actual Electron app (built main + vite dev renderer, isolated
 * userData) with seeded demo projects, starts three real fixture servers,
 * and screenshots: dashboard, project detail preview, terminal, agent chat
 * (via a rich mock omp RPC that streams text + tool cards).
 *
 * Usage:  node scripts/capture-screenshots.js
 * Output: docs/screenshots/{dashboard,preview,terminal,agent}.png
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const APP_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(APP_ROOT, 'docs', 'screenshots');
const RICH_MOCK = path.join(__dirname, 'mock-omp-rich.js');

function getFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function makeTempDir(prefix) {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeProject(dir, { name, port, html, logs }) {
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name, private: true, scripts: { start: 'node server.js' } }, null, 2)
  );
  const logLines = (logs || ['[boot] server started'])
    .map((l) => `  console.log(${JSON.stringify(l)});`)
    .join('\n');
  const server = `
const http = require('http');
const srv = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(${JSON.stringify(html)});
});
srv.listen(${port}, '127.0.0.1', () => {
${logLines}
});
const reqs = ['GET /orders 200 12ms', 'GET /products 200 8ms', 'POST /checkout 201 34ms', 'GET /health 200 3ms'];
setInterval(() => {
  const idx = Math.floor(Math.random() * reqs.length);
  console.log('[http] ' + reqs[idx]);
}, 1400);
`;
  await fs.promises.writeFile(path.join(dir, 'server.js'), server);
}

const STOREFRONT_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>NOVA — storefront</title>
<style>
  * { margin:0; box-sizing:border-box; font-family: system-ui, -apple-system, sans-serif; }
  body { background: radial-gradient(1200px 500px at 80% -10%, #2a1c0e 0%, #0d0b08 55%); color:#f5f1ea; min-height:100vh; padding:36px 44px; }
  nav { display:flex; align-items:center; gap:28px; font-size:13px; color:#a39a8c; }
  nav b { color:#ff9e2c; font-size:15px; letter-spacing:.08em; }
  nav span { margin-left:auto; color:#665e51; }
  h1 { margin-top:56px; font-size:42px; letter-spacing:-.02em; }
  h1 em { color:#ff9e2c; font-style:normal; }
  p.sub { margin-top:10px; color:#a39a8c; font-size:15px; max-width:420px; }
  .grid { margin-top:44px; display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
  .card { background:#171410; border:1px solid rgba(255,158,44,.14); border-radius:14px; padding:20px; }
  .card .img { height:110px; border-radius:10px; background:linear-gradient(135deg,#3a2410,#1d1913); display:grid; place-items:center; font-size:34px; }
  .card h3 { margin-top:14px; font-size:15px; }
  .card .price { margin-top:6px; color:#ff9e2c; font-weight:700; font-size:14px; }
  .card .tag { display:inline-block; margin-top:10px; font-size:10px; color:#5eead4; border:1px solid rgba(94,234,212,.3); border-radius:99px; padding:3px 9px; }
  .bar { margin-top:44px; display:flex; align-items:center; gap:10px; font-size:11px; color:#665e51; }
  .bar i { width:8px; height:8px; border-radius:50%; background:#5eead4; display:inline-block; }
</style></head>
<body>
  <nav><b>NOVA</b><span>Collections</span><span>Sale</span><span>Cart (2)</span></nav>
  <h1>New drop is <em>live</em>.<br/>Fresh kicks, zero bloat.</h1>
  <p class="sub">Storefront API connected. SSR rendered in 84ms — served from the embedded DevLauncher preview.</p>
  <div class="grid">
    <div class="card"><div class="img">👟</div><h3>Runner Zero</h3><div class="price">$129</div><span class="tag">NEW</span></div>
    <div class="card"><div class="img">🎒</div><h3>Field Pack</h3><div class="price">$89</div><span class="tag">BACK IN STOCK</span></div>
    <div class="card"><div class="img">🧢</div><h3>Cloud Cap</h3><div class="price">$34</div><span class="tag">-20%</span></div>
  </div>
  <div class="bar"><i></i> storefront-web · vite dev server · live from :4000</div>
</body></html>`;

async function waitForHttp(port, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`server on :${port} did not come up`);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(true)); // something is listening
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(false)));
  });
}

async function main() {
  const { launchApp, seedUserData } = require('../e2e/helpers');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Ports. The vite dev server MUST run on 5173: the main process only
  // trusts IPC senders from http://localhost:5173/ in dev mode
  // (electron/utils/ipcSecurity.ts → DEV_SERVER_URL), so any other port makes
  // every IPC call fail with "Unauthorized IPC sender" and projects never load.
  const VITE_PORT = 5173;
  process.env.VITE_DEV_PORT = String(VITE_PORT);
  const [storePort, apiPort, adminPort] = await Promise.all([getFreePort(), getFreePort(), getFreePort()]);

  // 2. Fixture project folders
  const base = await makeTempDir('devlauncher-shotproj-');
  const storeDir = path.join(base, 'storefront-web');
  const apiDir = path.join(base, 'api-backend');
  const adminDir = path.join(base, 'admin-panel');
  const staticDirs = [
    path.join(base, 'payment-service'),
    path.join(base, 'docs-site'),
    path.join(base, 'mobile-api'),
  ];
  await writeProject(storeDir, {
    name: 'storefront-web', port: storePort, html: STOREFRONT_HTML,
    logs: [
      '[boot] env loaded (.env) · 12 vars',
      '[boot] vite dev server ready',
      `[boot] listening on http://127.0.0.1:${storePort}`,
    ],
  });
  await writeProject(apiDir, {
    name: 'api-backend', port: apiPort, html: '<h1>api</h1>',
    logs: [
      '[boot] DB connected postgres@localhost:5432/gatrion (12ms)',
      `[boot] listening on http://127.0.0.1:${apiPort}`,
    ],
  });
  await writeProject(adminDir, {
    name: 'admin-panel', port: adminPort, html: '<h1>admin</h1>',
    logs: [
      '[boot] auth provider loaded',
      `[boot] listening on http://127.0.0.1:${adminPort}`,
    ],
  });
  for (const dir of staticDirs) await fs.promises.mkdir(dir, { recursive: true });

  const project = (id, dir, { name, type, port, startCommand, tags, emoji, color }) => ({
    id, name, path: dir, type, port,
    startCommand,
    commands: [{ id: 'main', name: type, command: startCommand, port, primary: true }],
    envVars: [], emoji, color, autoStart: false, tags, customCommands: [], dependsOn: [],
    schemaVersion: 3,
  });

  const projects = [
    project('storefront-web', storeDir, { name: 'storefront-web', type: 'REACT_VITE', port: storePort, startCommand: 'node server.js', tags: ['frontend', 'web'], emoji: '⚛️', color: '#61dafb' }),
    project('api-backend', apiDir, { name: 'api-backend', type: 'NODEJS', port: apiPort, startCommand: 'node server.js', tags: ['backend'], emoji: '🟩', color: '#339933' }),
    project('admin-panel', adminDir, { name: 'admin-panel', type: 'VITE', port: adminPort, startCommand: 'node server.js', tags: ['frontend'], emoji: '⚡', color: '#646cff' }),
    project('payment-service', staticDirs[0], { name: 'payment-service', type: 'GOLANG', port: 8080, startCommand: 'go run .', tags: ['backend', 'infra'], emoji: '🐹', color: '#00add8' }),
    project('docs-site', staticDirs[1], { name: 'docs-site', type: 'NODEJS', port: 8000, startCommand: 'npm run dev', tags: ['docs'], emoji: '📚', color: '#f5f1ea' }),
    project('mobile-api', staticDirs[2], { name: 'mobile-api', type: 'LARAVEL', port: 6000, startCommand: 'php artisan serve', tags: ['backend', 'mobile'], emoji: '🐘', color: '#ff2d20' }),
  ];

  const userData = await makeTempDir('devlauncher-shot-');
  await seedUserData(userData, { projects, config: { minimizeToTray: false } });

  // 3. Start vite dev server (the app loads the renderer from it)
  const viteBin = path.join(APP_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  let vite = null;
  if (await isPortOpen(VITE_PORT)) {
    console.log('reusing existing vite dev server on :5173');
  } else {
    vite = spawn(process.execPath, [viteBin, '--port', String(VITE_PORT), '--strictPort', '--host', '127.0.0.1'], {
      cwd: APP_ROOT, stdio: 'ignore',
    });
  }
  await waitForHttp(VITE_PORT);

  let app = null;
  try {
    // 4. Launch the app
    const launched = await launchApp({ DEVLAUNCHER_USER_DATA: userData, OMP_RPC_MOCK_SCRIPT: RICH_MOCK });
    app = launched.app;
    const { window } = launched;
    await window.setViewportSize({ width: 1440, height: 900 });
    await window.waitForTimeout(1200);

    // 5. Start the three running projects from their dashboard cards
    for (const name of ['storefront-web', 'api-backend', 'admin-panel']) {
      const card = window.locator('article', { hasText: name }).first();
      await card.getByRole('button', { name: 'Start', exact: true }).click();
    }
    // Wait until all three show Running
    for (const name of ['storefront-web', 'api-backend', 'admin-panel']) {
      await window.locator('article', { hasText: name }).first().getByText('Running').waitFor({ timeout: 25000 });
    }
    // Let CPU/RAM sampling + sparklines accumulate
    await window.waitForTimeout(14000);

    // 6. Dashboard
    await window.screenshot({ path: path.join(OUT_DIR, 'dashboard.png') });
    console.log('saved dashboard.png');

    // 7. Project detail → preview (App tab)
    // Force the iframe preview fallback BEFORE the detail view mounts: the
    // native WebContentsView is a separate surface that page.screenshot cannot
    // capture, and desktopCapturer window frames are unreliable (stale/occluded).
    // nativeAvailable() reads window.electron.previewShow at mount — a Proxy
    // that hides just that one method makes AppPreviewTab render an <iframe>.
    const patched = await window.evaluate(() => {
      const desc = Object.getOwnPropertyDescriptor(window, 'electron');
      if (desc && desc.configurable) {
        window.electron = new Proxy(window.electron, {
          get(target, key) { return key === 'previewShow' ? undefined : Reflect.get(target, key); },
        });
        return true;
      }
      return false;
    });
    console.log('electron proxy patch (iframe fallback):', patched);

    await window.getByText('storefront-web', { exact: true }).first().click();
    await window.getByRole('button', { name: 'Back to Projects' }).waitFor({ timeout: 10000 });
    // Give the iframe time to load the storefront page
    await window.waitForTimeout(4000);
    await window.screenshot({ path: path.join(OUT_DIR, 'preview.png') });
    console.log('saved preview.png');

    // 8. Terminal tab (the native preview surface can swallow the first click,
    // so verify the tab actually activated and force-click if it didn't)
    const terminalTab = window.getByRole('tab', { name: 'Terminal' });
    await terminalTab.click();
    await window.waitForTimeout(800);
    let terminalActive = await window.evaluate(
      () => document.querySelector('[data-tab="terminal"]')?.getAttribute('aria-selected') === 'true'
    );
    if (!terminalActive) {
      await terminalTab.click({ force: true });
      await window.waitForTimeout(800);
      terminalActive = await window.evaluate(
        () => document.querySelector('[data-tab="terminal"]')?.getAttribute('aria-selected') === 'true'
      );
    }
    console.log('terminal tab active:', terminalActive);
    await window.waitForTimeout(1200);
    await window.screenshot({ path: path.join(OUT_DIR, 'terminal.png') });
    console.log('saved terminal.png');

    // 9. Agent chat (mock omp with tool cards)
    const agentNav = window.getByRole('button', { name: /agent/i }).or(window.getByText(/^agent$/i));
    await agentNav.first().click();
    await window.getByText('Sessions').first().waitFor({ timeout: 10000 });
    await window.getByText('provider ready').first().waitFor({ timeout: 10000 });
    // Scope to the sessions sidebar: project rows there are div[role=button],
    // unlike the RUNNING NOW cards (native <button>s) that also contain the
    // project name — clicking the native one navigates to Project Detail.
    await window.locator('div[role="button"]').filter({ hasText: 'storefront-web' }).first().click();
    await window.getByRole('button', { name: /new session/i }).first().click();
    const composer = window.getByPlaceholder('Describe a task, ask a question…');
    await composer.waitFor({ timeout: 10000 });
    await composer.fill('Perbaiki build storefront-web yang gagal');
    await composer.press('Enter');
    // Wait for the full turn (text + 2 tool cards)
    await window.getByText(/Mau saya commit perubahan itu/).first().waitFor({ timeout: 20000 });
    await window.waitForTimeout(1200);
    await window.screenshot({ path: path.join(OUT_DIR, 'agent.png') });
    console.log('saved agent.png');
  } finally {
    if (app) {
      const pid = app.process().pid;
      if (pid && process.platform === 'win32') {
        try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* dead */ }
      }
      try { app.process().kill('SIGKILL'); } catch { /* dead */ }
    }
    try { if (vite) vite.kill('SIGKILL'); } catch { /* dead */ }
  }
  console.log('done →', OUT_DIR);
}

main().catch((err) => {
  console.error('capture failed:', err);
  process.exit(1);
});
