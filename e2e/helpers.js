const { _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const APP_ROOT = path.join(__dirname, '..');
const VITE_PORT = process.env.VITE_DEV_PORT || 5173;

// GitHub Actions Linux runners lack the SUID sandbox helper / user namespaces
// — Electron aborts at launch unless the Chromium sandbox is disabled.
const ELECTRON_ARGS = [APP_ROOT];
if (process.platform === 'linux' || process.env.CI) {
  ELECTRON_ARGS.unshift('--no-sandbox', '--disable-dev-shm-usage');
}

/**
 * Launch the Electron app for e2e with an isolated userData directory so the
 * test never touches real workspace data. `extraEnv` is merged into the app
 * environment (e.g. DEVLAUNCHER_TEST_FOLDER, OMP_RPC_MOCK_SCRIPT).
 */
async function launchApp(extraEnv = {}) {
  const app = await electron.launch({
    args: ELECTRON_ARGS,
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
  const root = path.join(APP_ROOT, 'test-results', 'fixtures');
  await fs.promises.mkdir(root, { recursive: true });
  return fs.promises.mkdtemp(path.join(root, prefix));
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

/**
 * Create a Laravel fixture the ProjectDetector can classify as LARAVEL.
 * `options.wireVite` controls whether the frontend is genuinely wired to
 * Laravel (laravel-vite-plugin in devDependencies) vs a bare vite dependency —
 * the case where no separate "Frontend assets" process should be detected.
 */
async function writeLaravelFixture(dir, { wireVite = false, name = 'e2e-laravel' } = {}) {
  const devDependencies = { vite: '^6.0.0', ...(wireVite ? { 'laravel-vite-plugin': '^1.2.0' } : {}) };
  await fs.promises.writeFile(path.join(dir, 'artisan'), '<?php\n');
  await fs.promises.writeFile(
    path.join(dir, 'composer.json'),
    JSON.stringify({ name: `e2e/${name}`, require: { 'laravel/framework': '^10.0' } }, null, 2),
  );
  await fs.promises.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      private: true,
      scripts: { dev: 'vite', build: 'vite build' },
      devDependencies,
    }, null, 2),
  );
  return dir;
}

/** Create a minimal Laravel fixture dir, either bare-vite or plugin-wired. */
async function writeLaravelViteFixture(dir, options) {
  return writeLaravelFixture(dir, options);
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
  writeLaravelFixture,
  writeLaravelViteFixture,
  seedUserData,
  fixtureProject,
  FIXTURE_START_JS,
};
