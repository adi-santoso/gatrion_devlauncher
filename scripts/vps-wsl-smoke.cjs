/** Packaged app against a real local WSL OpenSSH/systemd target.
 * Requires VPS_TEST_PASSWORD or VPS_TEST_KEY; never writes secrets to evidence.
 * SSH listener and probe service must be prepared separately.
 */
/* global window, document */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('@playwright/test');

async function main() {
  const password = process.env.VPS_TEST_PASSWORD;
  const username = process.env.VPS_TEST_USERNAME || 'santos';
  const remoteCwd = `/home/${username}`;
  const privateKey = process.env.VPS_TEST_KEY ? fs.readFileSync(process.env.VPS_TEST_KEY, 'utf8') : null;
  delete process.env.VPS_TEST_PASSWORD;
  if (!password && !privateKey) throw new Error('Set VPS_TEST_PASSWORD or VPS_TEST_KEY for the isolated WSL test');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'devlauncher-wsl-'));
  const app = await _electron.launch({
    executablePath: path.resolve('dist/win-unpacked/DevLauncher.exe'),
    env: { ...process.env, DEVLAUNCHER_USER_DATA: userData,
      DEVLAUNCHER_VPS_CONTEXT_DIR: path.join(userData, 'vps-context') },
  });
  let checks = 0;
  const check = (name, valid) => {
    if (!valid) throw new Error(`FAIL ${name}`);
    checks++;
    console.log(`PASS ${name}`);
  };
  try {
    const win = await app.firstWindow();
    await win.waitForFunction(() => document.body.innerText.trim().length > 0);
    check('real packaged runtime', await app.evaluate(({ app: a }) => a.isPackaged));
    const input = { name: 'WSL-local-test', host: '127.0.0.1', port: 22222,
      username, environment: 'development', policy: 'controlled',
      authKind: privateKey ? 'key' : 'password', defaultCwd: remoteCwd };
    const secret = privateKey ? { kind: 'key', privateKey } : { kind: 'password', password };
    const probe = await win.evaluate(({ input: i, secret: s }) => window.electron.vpsTestConnection(i, s), { input, secret });
    const fingerprint = JSON.stringify(probe).match(/SHA256:[A-Za-z0-9+/=]+/)?.[0];
    if (!probe.success) throw new Error(`OpenSSH probe: ${probe.result?.error || probe.error || 'unknown error'}`);
    check('OpenSSH handshake fingerprint', !!fingerprint);
    check('fingerprint matches locally verified WSL key', fingerprint === process.env.VPS_TEST_FINGERPRINT);
    const added = await win.evaluate(({ input: i, secret: s }) => window.electron.vpsAddServer(i, s), { input, secret });
    const id = added.server?.id;
    check('isolated credential saved', !!id);
    const refused = await win.evaluate((s) => window.electron.vpsConnect(s), id);
    check('unknown host is refused', !refused.success && /Unknown host key/.test(refused.error));
    const connect = () => win.evaluate(({ id: s, fingerprint: f }) => window.electron.vpsConnect(s, f), { id, fingerprint });
    const connected = await connect();
    if (!connected.success) throw new Error(`SSH login: ${connected.error || 'authentication failed'}`);
    check(`${username} ${privateKey ? 'key' : 'password'} authenticates`, connected.status?.state === 'connected');
    const overview = await win.evaluate((s) => window.electron.vpsOverview(s), id);
    check('real Ubuntu overview', overview.success && /Ubuntu/.test(JSON.stringify(overview)));
    const services = await win.evaluate((s) => window.electron.vpsListServices(s), id);
    check('real systemd service discovery', services.success && /devlauncher-vps-probe/.test(JSON.stringify(services)));
    const logs = await win.evaluate((s) => window.electron.vpsGetLogs(s, 'devlauncher-vps-probe.service', 50), id);
    check('real journald output', logs.success && /DEVLAUNCHER_WSL_LOG_CHECK/.test(JSON.stringify(logs)));
    const run = async (command) => {
      const res = await win.evaluate(({ id: s, command: c, cwd }) => window.electron.vpsExec(s, { command: c, cwd }), { id, command, cwd: remoteCwd });
      if (!res.job) throw new Error('Remote exec failed to create a job');
      for (let n = 0; n < 40; n++) {
        const job = (await win.evaluate(({ id: j, server: s }) => window.electron.vpsGetJob(j, s), { id: res.job.id, server: id })).job;
        if (job.state !== 'running' && job.state !== 'queued') return job;
        await win.waitForTimeout(100);
      }
      throw new Error('Remote job did not finish');
    };
    const exec = await run('printf "WSL_EXEC_CHECK\\n"; id -un; pwd');
    check('remote exec identity and cwd', exec.state === 'succeeded' && exec.exitCode === 0
      && /WSL_EXEC_CHECK/.test(exec.output) && exec.output.includes(username) && exec.output.includes(remoteCwd));
    const failed = await run('exit 7');
    check('real nonzero exit preserved', failed.state === 'failed' && failed.exitCode === 7);
    await win.evaluate(() => {
      window.__wslTerminal = '';
      window.__wslUnsub = window.electron.onVpsTerminalData((_id, data) => { window.__wslTerminal += data; });
    });
    const term = await win.evaluate((s) => window.electron.vpsTerminalOpen(s, 80, 24), id);
    check('real remote PTY opens', term.success);
    await win.evaluate((s) => window.electron.vpsTerminalInput(s, 'printf "WSL_PTY_CHECK\\n"; id -un\r'), id);
    await win.waitForFunction((user) => /WSL_PTY_CHECK/.test(window.__wslTerminal) && window.__wslTerminal.includes(user), username);
    check('real PTY executes input', true);
    await win.evaluate((s) => window.electron.vpsTerminalClose(s), id);
    await win.evaluate((s) => window.electron.vpsDisconnect(s), id);
    check('disconnect', (await win.evaluate((s) => window.electron.vpsGetStatus(s), id)).status.state === 'disconnected');
    check('reconnect to trusted host', (await connect()).status?.state === 'connected');
    await win.evaluate((s) => window.electron.vpsDisconnect(s), id);
    const registry = await win.evaluate(() => window.electron.vpsListServers());
    const credential = privateKey || password;
    check('credential absent from renderer registry and registry file', !JSON.stringify(registry).includes(credential)
      && !fs.readFileSync(path.join(userData, 'vps-servers.json'), 'utf8').includes(credential));
    console.log(`${checks}/${checks} checks passed; isolated userData=${userData}`);
  } finally { await app.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
