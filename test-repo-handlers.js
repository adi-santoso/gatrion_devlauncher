const assert = require('assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const cp = require('child_process')

// ===========================================================================
// Fakes: electron + child_process.execFile (git simulation)
// ===========================================================================

const handlers = new Map()
const gitCalls = []
const gitOptions = []
const customCalls = []

const PORCELAIN = [
  '## main...origin/main [ahead 2, behind 1]',
  ' M src/App.jsx',
  'MM src/hooks/useProcesses.js',
  'A  src/new-file.js',
  ' D src/old-file.js',
  'R  old-name.txt -> new-name.txt',
  '?? untracked-folder/',
  '?? "quoted file.txt"',
  '',
].join('\n')

const LOG_OUTPUT = 'a1b2c3d\x1fAlice\x1f2026-08-01\x1fAdd checkout branch\x1e\ne2f3g4h\x1fBob\x1f2026-07-28\x1fFix env loader\x1e\n'

const DIFF_OUTPUT = 'diff --git a/src/App.jsx b/src/App.jsx\n@@ -1,3 +1,3 @@\n-const a = 1\n+const a = 2\n'

const gitMode = { repo: true, missing: false }

function fakeExecFile(bin, args, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  if (bin !== 'git') {
    callback(new Error(`spawn ${bin} ENOENT`), '', '')
    return
  }
  gitCalls.push([...args])
  gitOptions.push(options)
  if (gitMode.missing) {
    callback(new Error('spawn git ENOENT'), '', '')
    return
  }
  const [cmd, ...rest] = args
  if (cmd === 'rev-parse') {
    if (gitMode.repo) callback(null, 'true\n', '')
    else callback(new Error('fatal: not a git repository (or any of the parent directories): .git'), '', 'fatal: not a git repository')
    return
  }
  if (cmd === 'status') {
    callback(null, PORCELAIN, '')
    return
  }
  if (cmd === 'log') {
    callback(null, LOG_OUTPUT, '')
    return
  }
  if (cmd === 'diff') {
    callback(null, DIFF_OUTPUT, '')
    return
  }
  if (cmd === 'add' || cmd === 'reset' || cmd === 'init') {
    callback(null, '', '')
    return
  }
  if (cmd === 'commit') {
    callback(null, `[master ${rest[1]}] ${rest[2]}\n 1 file changed\n`, '')
    return
  }
  if (cmd === 'pull') {
    callback(null, 'Already up to date.\n', '')
    return
  }
  if (cmd === 'push') {
    callback(null, 'Everything up-to-date\n', '')
    return
  }
  if (cmd === 'checkout') {
    callback(null, '', '')
    return
  }
  callback(new Error(`unhandled git command: ${args.join(' ')}`), '', '')
}

const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') {
    return { app: { isPackaged: false }, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const originalExecFile = cp.execFile
cp.execFile = fakeExecFile

const { setupRepoHandlers, parseStatus, parseLog, readPackageJson, runGit } = require('./electron/handlers/repoHandlers')

Module._load = originalLoad
cp.execFile = originalExecFile

// ===========================================================================

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-test-'))
  const projectPath = path.join(tmpDir, 'app')
  fs.mkdirSync(projectPath, { recursive: true })
  fs.writeFileSync(
    path.join(projectPath, 'package.json'),
    JSON.stringify({
      name: 'app',
      scripts: { dev: 'vite', build: 'vite build', 'test:unit': 'vitest run' },
      dependencies: { react: '^19' },
      devDependencies: { vite: '^8' },
    }),
    'utf8'
  )
  fs.writeFileSync(path.join(projectPath, 'package-lock.json'), '{}', 'utf8')

  const project = { id: 'trusted', path: projectPath, envVars: [{ key: 'A', value: '1' }] }
  const processManager = {
    on: () => {},
    runCustomCommand: async (projectId, p, commandId, label, command, env, onLog) => {
      customCalls.push({ projectId, p, commandId, label, command, env, onLog })
      return { success: true, runId: 42, pid: 1234 }
    },
    getProcessStatus: () => ({ status: 'STOPPED' }),
  }
  const storageManager = { loadProjects: async () => [project] }
  const mainWindow = { isDestroyed: () => false, webContents: { send: () => {} } }
  setupRepoHandlers(storageManager, processManager, mainWindow)
  const event = { senderFrame: { url: 'http://localhost:5173/' } }

  // --- parseStatus unit checks ------------------------------------------
  const parsed = parseStatus(PORCELAIN)
  assert.equal(parsed.branch, 'main')
  assert.equal(parsed.upstream, 'origin/main')
  assert.equal(parsed.ahead, 2)
  assert.equal(parsed.behind, 1)
  assert.deepEqual(parsed.staged.map((e) => e.path), [
    'src/hooks/useProcesses.js', 'src/new-file.js', 'new-name.txt',
  ])
  assert.equal(parsed.staged[0].staged, 'modified')
  assert.equal(parsed.staged[0].unstaged, 'modified')
  assert.equal(parsed.staged[1].staged, 'added')
  assert.equal(parsed.staged[2].staged, 'renamed')
  assert.deepEqual(parsed.unstaged.map((e) => e.path), [
    'src/App.jsx', 'src/hooks/useProcesses.js', 'src/old-file.js',
  ])
  assert.equal(parsed.unstaged[2].unstaged, 'deleted')
  assert.deepEqual(parsed.untracked, ['untracked-folder/', 'quoted file.txt'])

  const noUpstream = parseStatus('## dev\n M a.txt\n')
  assert.equal(noUpstream.branch, 'dev')
  assert.equal(noUpstream.upstream, null)
  assert.equal(noUpstream.ahead, 0)

  const commits = parseLog(LOG_OUTPUT)
  assert.equal(commits.length, 2)
  assert.equal(commits[0].hash, 'a1b2c3d')
  assert.equal(commits[0].subject, 'Add checkout branch')
  assert.equal(commits[1].author, 'Bob')

  // --- git read handlers ------------------------------------------------
  const status = await handlers.get('git-status')(event, projectPath)
  assert.equal(status.success, true)
  assert.equal(status.branch, 'main')
  assert.equal(status.ahead, 2)
  assert.equal(status.staged.length, 3)
  assert.equal(status.untracked.length, 2)

  const log = await handlers.get('git-log')(event, projectPath, 5)
  assert.equal(log.success, true)
  assert.equal(log.commits.length, 2)

  const diff = await handlers.get('git-diff')(event, projectPath, 'src/App.jsx', false)
  assert.equal(diff.success, true)
  assert.match(diff.diff, /^diff --git/)
  const stagedDiff = await handlers.get('git-diff')(event, projectPath, 'src/App.jsx', true)
  assert.deepEqual(gitCalls[gitCalls.length - 1], ['diff', '--color=never', '--cached', '--', 'src/App.jsx'])
  assert.equal(stagedDiff.success, true)

  // GIT_TERMINAL_PROMPT is disabled so git never hangs waiting for input
  assert.equal(gitOptions[0].env.GIT_TERMINAL_PROMPT, '0')

  // --- git write handlers ----------------------------------------------
  await handlers.get('git-stage')(event, projectPath, ['src/App.jsx', 'src/new-file.js'])
  assert.deepEqual(gitCalls[gitCalls.length - 1], ['add', '--', 'src/App.jsx', 'src/new-file.js'])
  await handlers.get('git-stage')(event, projectPath, [])
  assert.deepEqual(gitCalls[gitCalls.length - 1], ['add', '-A'])
  await handlers.get('git-unstage')(event, projectPath, ['src/App.jsx'])
  assert.deepEqual(gitCalls[gitCalls.length - 1], ['reset', '--', 'src/App.jsx'])
  await handlers.get('git-unstage')(event, projectPath, [])
  assert.deepEqual(gitCalls[gitCalls.length - 1], ['reset'])

  const committed = await handlers.get('git-commit')(event, projectPath, 'feat: wire git tab')
  assert.equal(committed.success, true)
  assert.deepEqual(gitCalls[gitCalls.length - 1], ['commit', '-m', 'feat: wire git tab'])
  const emptyCommit = await handlers.get('git-commit')(event, projectPath, '   ')
  assert.equal(emptyCommit.success, false)

  const pulled = await handlers.get('git-pull')(event, projectPath)
  assert.equal(pulled.success, true)
  assert.deepEqual(gitCalls[gitCalls.length - 1], ['pull'])
  const pushed = await handlers.get('git-push')(event, projectPath)
  assert.equal(pushed.success, true)
  assert.deepEqual(gitCalls[gitCalls.length - 1], ['push'])

  const checkout = await handlers.get('git-checkout')(event, projectPath, 'feat/git-tab', true)
  assert.equal(checkout.success, true)
  assert.deepEqual(gitCalls[gitCalls.length - 1], ['checkout', '-b', 'feat/git-tab'])
  const badBranch = await handlers.get('git-checkout')(event, projectPath, '--danger')
  assert.equal(badBranch.success, false)
  const init = await handlers.get('git-init')(event, projectPath)
  assert.equal(init.success, true)
  assert.deepEqual(gitCalls[gitCalls.length - 1], ['init'])

  // --- not a repo / git missing -----------------------------------------
  gitMode.repo = false
  const notRepo = await handlers.get('git-status')(event, projectPath)
  assert.equal(notRepo.success, true)
  assert.equal(notRepo.isRepo, false)
  gitMode.repo = true

  gitMode.missing = true
  const missing = await handlers.get('git-status')(event, projectPath)
  assert.equal(missing.success, false)
  assert.ok(missing.error, 'reports an error when git is missing')
  gitMode.missing = false

  // --- package tooling ----------------------------------------------------
  const scripts = await handlers.get('read-package-scripts')(event, projectPath)
  assert.equal(scripts.success, true)
  assert.equal(scripts.hasPackageJson, true)
  assert.deepEqual(scripts.scripts.map((s) => s.name), ['build', 'dev', 'test:unit'])
  assert.equal(scripts.scripts[1].command, 'vite')

  const deps = await handlers.get('check-dependencies')(event, projectPath)
  assert.equal(deps.success, true)
  assert.equal(deps.hasNodeModules, false)
  assert.equal(deps.lockfile, 'package-lock.json')
  assert.equal(deps.packageManager, 'npm')
  assert.equal(deps.depCount, 2)
  assert.equal(deps.scriptCount, 3)

  const runScript = await handlers.get('run-project-script')(event, project.id, 'dev')
  assert.equal(runScript.success, true)
  assert.equal(runScript.runId, 42)
  assert.deepEqual(customCalls[customCalls.length - 1], {
    projectId: 'trusted',
    p: projectPath,
    commandId: 'script:dev',
    label: 'dev',
    command: 'npm run dev',
    env: { A: '1' },
    onLog: customCalls[customCalls.length - 1].onLog,
  })

  const unknownScript = await handlers.get('run-project-script')(event, project.id, 'nope')
  assert.equal(unknownScript.success, false)

  const install = await handlers.get('install-dependencies')(event, project.id)
  assert.equal(install.success, true)
  assert.equal(install.packageManager, 'npm')
  assert.deepEqual(customCalls[customCalls.length - 1].command, 'npm install')

  // --- security ------------------------------------------------------------
  const unauthorized = await handlers.get('git-status')(
    { senderFrame: { url: 'https://attacker.example/' } },
    projectPath
  )
  assert.equal(unauthorized.success, false)
  assert.match(unauthorized.error, /Unauthorized/)

  // --- pure helpers ---------------------------------------------------------
  assert.equal(readPackageJson(projectPath).scripts.dev, 'vite')
  assert.equal(readPackageJson(path.join(tmpDir, 'nope')), null)
  const direct = await runGit(projectPath, ['status'])
  assert.match(direct, /## main/)

  fs.rmSync(tmpDir, { recursive: true, force: true })
  console.log('Repo handler checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
