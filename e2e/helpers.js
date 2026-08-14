const { _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_ROOT = path.join(__dirname, '..');
const VITE_PORT = process.env.VITE_DEV_PORT || 5173;

/**
 * Launch the Electron app for e2e with an isolated userData directory so the
 * test never touches real workspace data. `extraEnv` is merged into the app
 * environment (e.g. DEVLAUNCHER_TEST_FOLDER, OMP_RPC_MOCK_SCRIPT).
 */
async function launchApp(extraEnv = {}) {
  const app = await electron.launch({
    args: [APP_ROOT],
    env: { ...process.env, NODE_ENV: 'test', ...extraEnv },
  });
  let appWindow = null;
  for (let i = 0; i < 20 && !appWindow; i += 1) {
    appWindow = app.windows().find((w) => w.url().startsWith(`http://localhost:${VITE_PORT}`)) || null;
    if (!appWindow) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!appWindow) appWindow = await app.firstWindow();
  await appWindow.waitForLoadState('domcontentloaded');
  // Wait for React to finish hydrating and load projects/config
  await appWindow.waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 20000 });
  return { app, window: appWindow };
}

async function makeTempDir(prefix) {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
}

const FIXTURE_START_JS = `// Long-running fixture process for e2e: emits log lines until stopped.
console.log('[e2e] fixture started');
let i = 0;
const timer = setInterval(() => {
  i += 1;
  console.log('[e2e] tick ' + i);
}, 500);
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => { clearInterval(timer); console.log('[e2e] fixture stopped'); process.exit(0); });
}
`;

/** Create a minimal Node project dir whose `npm start` runs a logging fixture. */
async function writeFixtureProject(dir) {
  await fs.promises.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'e2e-fixture', private: true, scripts: { start: 'node start.js' } }, null, 2),
  );
  await fs.promises.writeFile(path.join(dir, 'start.js'), FIXTURE_START_JS);
  return dir;
}

/** Pre-seed an isolated userData dir (projects.json / config.json). */
async function seedUserData(userDataDir, { projects = [], config = null } = {}) {
  await fs.promises.mkdir(userDataDir, { recursive: true });
  await fs.promises.writeFile(path.join(userDataDir, 'projects.json'), JSON.stringify(projects, null, 2));
  if (config) await fs.promises.writeFile(path.join(userDataDir, 'config.json'), JSON.stringify(config, null, 2));
}

/** Minimal valid project object (matches the normalized schema). */
function fixtureProject(id, projectPath, overrides = {}) {
  return {
    id,
    name: 'e2e-fixture',
    path: projectPath,
    type: 'NODEJS',
    port: 3000,
    startCommand: 'npm start',
    commands: [{ id: 'main', name: 'Node.js', command: 'npm start', port: 3000, primary: true }],
    envVars: [],
    emoji: '🟩',
    color: '#339933',
    autoStart: false,
    tags: [],
    customCommands: [],
    dependsOn: [],
    schemaVersion: 3,
    ...overrides,
  };
}

module.exports = {
  APP_ROOT,
  VITE_PORT,
  launchApp,
  makeTempDir,
  writeFixtureProject,
  seedUserData,
  fixtureProject,
  FIXTURE_START_JS,
};
