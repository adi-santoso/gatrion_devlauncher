/**
 * Packaged Windows smoke test for the VPS Command Center (F4).
 *
 *   npm run build && node scripts/vps-packaged-smoke.cjs
 *
 * Launches dist/win-unpacked/DevLauncher.exe -- the exact payload the NSIS and
 * portable installers ship -- with an isolated userData directory, then drives
 * the VPS feature through the packaged preload/IPC/main chain against the
 * in-process SSH fixture in tests/fixtures/ssh-server.js.
 *
 * No real host, key, credential or userData directory is involved.
 *
 * Why this exists in addition to e2e/vps.spec.js: the spec runs the app from
 * source, where Node resolves `ssh2` straight out of node_modules. The packaged
 * build externalizes it into app.asar instead, so only this harness proves the
 * shipped bundle can still open an SSH connection, read remote data, run a
 * remote command and open a PTY.
 */
// The callbacks handed to win.evaluate()/waitForFunction() are serialized and run
// inside the renderer, so they legitimately touch browser globals from this file.
/* global window, document */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { _electron } = require('@playwright/test');
const { createSshFixture } = require('../tests/fixtures/ssh-server');

const EXE = process.env.VPS_PACKAGED_EXE || path.join(__dirname, '..', 'dist', 'win-unpacked', 'DevLauncher.exe');
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
};

const JOB_TERMINAL_STATES = ['succeeded', 'failed', 'cancelled', 'unknown'];

/** Poll a job until it reaches a terminal state (or we run out of patience). */
async function waitForJob(win, jobId, serverId) {
  for (let i = 0; i < 40; i += 1) {
    const res = await win.evaluate(
      ({ id, server }) => window.electron.vpsGetJob(id, server),
      { id: jobId, server: serverId },
    );
    const job = res && res.job;
    if (job && JOB_TERMINAL_STATES.includes(job.state)) return job;
    await win.waitForTimeout(250);
  }
  return null;
}

(async () => {
  if (!fs.existsSync(EXE)) {
    console.error(`Packaged app not found at ${EXE}\nRun \`npm run build\` first.`);
    process.exit(1);
  }

  const fixture = await createSshFixture();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'devlauncher-packaged-'));
  let app;

  try {
    app = await _electron.launch({
      executablePath: EXE,
      args: [],
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        DEVLAUNCHER_USER_DATA: userData,
        DEVLAUNCHER_VPS_CONTEXT_DIR: path.join(userData, 'vps-context'),
      },
      timeout: 60000,
    });

    const isPackaged = await app.evaluate(({ app: electronApp }) => electronApp.isPackaged);
    record('packaged app launches', !!app && isPackaged === true, `isPackaged=${isPackaged} pid=${app.process().pid}`);

    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 30000 });
    record('renderer loaded from app.asar', win.url().includes('app.asar'), win.url());

    // --- the VPS view is present in the built renderer bundle ---
    const vpsNav = win.getByRole('button', { name: /(^|\b)vps(\b|$)/i });
    const navCount = await vpsNav.count();
    if (navCount > 0) {
      await vpsNav.first().click();
      await win.waitForTimeout(1200);
    }
    const body = await win.evaluate(() => document.body.innerText);
    record('VPS nav + view render', navCount > 0 && /vps/i.test(body), `${body.length} chars of body text`);

    // --- add server with a key generated per run (never a real credential) ---
    const input = {
      name: 'packaged-fixture',
      host: '127.0.0.1',
      port: fixture.port,
      username: 'fixture',
      environment: 'development',
      policy: 'controlled',
      authKind: 'key',
      defaultCwd: '/var/www/app',
    };
    const secret = { kind: 'key', privateKey: fixture.clientPrivateKey };

    const added = await win.evaluate(
      ({ i, s }) => window.electron.vpsAddServer(i, s),
      { i: input, s: secret },
    );
    const serverId = added && added.server && added.server.id;
    record('vps-add-server persists server', !!serverId, `id=${serverId}`);

    // --- test connection: the observed host key is surfaced, not auto-trusted ---
    const tested = await win.evaluate(
      ({ i, s }) => window.electron.vpsTestConnection(i, s),
      { i: input, s: secret },
    );
    const testedJson = JSON.stringify(tested);
    const fingerprintMatch = testedJson.match(/SHA256:[A-Za-z0-9+/=]+/);
    record('vps-test-connection reaches SSH fixture (ssh2 resolves from app.asar)',
      Boolean(tested && tested.success) && Boolean(fingerprintMatch),
      testedJson.slice(0, 180));
    const fingerprint = fingerprintMatch ? fingerprintMatch[0] : null;

    // --- an unknown host key must be reviewed before any connection is made ---
    const untrusted = await win.evaluate((id) => window.electron.vpsConnect(id), serverId);
    const untrustedState = untrusted && untrusted.status && untrusted.status.state;
    const untrustedJson = JSON.stringify(untrusted);
    record('connect without trust does not silently accept the host key',
      untrustedState !== 'connected' && /host.?key|fingerprint|pending|verif/i.test(untrustedJson),
      untrustedJson.slice(0, 300));

    const connected = await win.evaluate(
      ({ id, fp }) => window.electron.vpsConnect(id, fp),
      { id: serverId, fp: fingerprint },
    );
    record('connect after trusting the fingerprint succeeds',
      Boolean(connected && connected.status && connected.status.state === 'connected'),
      JSON.stringify(connected && connected.status).slice(0, 180));

    // --- remote reads are parsed from the fixture's canned output ---
    const overview = await win.evaluate((id) => window.electron.vpsOverview(id), serverId);
    const overviewJson = JSON.stringify(overview);
    record('remote overview parsed from fixture',
      /fixture-host/.test(overviewJson) && /Fixture Linux 1\.0/.test(overviewJson),
      overviewJson.slice(0, 200));

    const services = await win.evaluate((id) => window.electron.vpsListServices(id), serverId);
    record('remote services list parsed',
      /nginx\.service/.test(JSON.stringify(services)),
      JSON.stringify(services).slice(0, 160));

    const logs = await win.evaluate(
      ({ id }) => window.electron.vpsGetLogs(id, 'api.service', 50),
      { id: serverId },
    );
    record('remote journald logs parsed',
      /listening on :8080/.test(JSON.stringify(logs)),
      JSON.stringify(logs).slice(0, 160));

    // --- a real remote exec through the packaged job registry ---
    const execRes = await win.evaluate(
      ({ id }) => window.electron.vpsExec(id, { command: 'echo packaged-smoke', cwd: '/var/www/app' }),
      { id: serverId },
    );
    const jobId = execRes && execRes.job && execRes.job.id;
    const job = jobId ? await waitForJob(win, jobId, serverId) : null;
    // The fixture echoes the command it was handed, which the builder wraps in
    // `cd '<cwd>' && ...` — so match the tail, not the bare command.
    const jobOutput = job ? String(job.output || '').trim() : '';
    record('remote exec runs and reports its exit state',
      Boolean(job) && job.state === 'succeeded' && job.exitCode === 0 && /ran:.*echo packaged-smoke/.test(jobOutput),
      job ? `state=${job.state} exitCode=${job.exitCode} output=${JSON.stringify(jobOutput)}` : 'no job');

    // --- remote PTY opens ---
    const term = await win.evaluate((id) => window.electron.vpsTerminalOpen(id, 80, 24), serverId);
    record('remote PTY shell opens', Boolean(term && term.success), JSON.stringify(term).slice(0, 120));
    await win.evaluate((id) => window.electron.vpsTerminalClose(id), serverId);

    // --- disconnect ---
    const off = await win.evaluate((id) => window.electron.vpsDisconnect(id), serverId);
    const status = await win.evaluate((id) => window.electron.vpsGetStatus(id), serverId);
    record('disconnect returns the server to disconnected',
      Boolean(off && off.success) && status && status.status && status.status.state !== 'connected',
      JSON.stringify(status && status.status).slice(0, 140));

    // --- the private key never crosses into the renderer-visible registry ---
    const registry = await win.evaluate(() => window.electron.vpsListServers());
    const registryJson = JSON.stringify(registry);
    record('registry never exposes the private key',
      !/PRIVATE KEY/.test(registryJson) && !registryJson.includes(fixture.clientPrivateKey.slice(-40)),
      `${registryJson.length} bytes of registry JSON`);

    // --- state landed in the isolated userData dir ---
    const storeFile = path.join(userData, 'vps-servers.json');
    record('server registry persisted to the isolated userData',
      fs.existsSync(storeFile) && /packaged-fixture/.test(fs.readFileSync(storeFile, 'utf8')),
      storeFile);
  } catch (err) {
    record('smoke run completed', false, String(err && err.stack ? err.stack.split('\n')[0] : err));
  } finally {
    if (app) {
      try { await app.close(); } catch { /* already gone */ }
    }
    await fixture.close().catch(() => {});
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
})();
