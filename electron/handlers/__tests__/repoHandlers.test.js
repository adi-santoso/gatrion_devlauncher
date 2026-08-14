import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const { ipcMain, __reset } = createRequire(import.meta.url)('electron')

import { setupRepoHandlers, parseStatus, parseLog, readPackageJson } from '../repoHandlers'

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }

let tempRoot

function makeStorageManager(projects) {
  return {
    _projects: projects,
    async loadProjects() {
      return this._projects
    },
  }
}

function makeProcessManager() {
  return {
    getProcessStatus: () => ({ status: 'stopped' }),
    runCustomCommand: vi.fn(async () => ({ runId: 1 })),
  }
}

function makeWindow() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } }
}

const project = (id, dir) => ({ id, name: id, path: dir, envVars: [] })

beforeEach(() => {
  __reset()
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-handlers-'))
})

describe('parseStatus / parseLog', () => {
  test('parses porcelain status with branch, staged, unstaged and untracked', () => {
    const output = [
      '## main...origin/main [ahead 2, behind 1]',
      ' M src/a.js',
      'A  src/new.js',
      '?? untracked.txt',
      'R  old.txt -> new.txt',
    ].join('\n')
    const status = parseStatus(output)
    expect(status.branch).toBe('main')
    expect(status.upstream).toBe('origin/main')
    expect(status.ahead).toBe(2)
    expect(status.behind).toBe(1)
    expect(status.staged.map((s) => s.path)).toContain('src/new.js')
    expect(status.staged.map((s) => s.path)).toContain('new.txt')
    expect(status.unstaged.map((s) => s.path)).toContain('src/a.js')
    expect(status.untracked).toContain('untracked.txt')
  })

  test('parses empty status without a branch line', () => {
    const status = parseStatus('')
    expect(status.branch).toBeNull()
    expect(status.staged).toEqual([])
    expect(status.untracked).toEqual([])
  })

  test('parseLog splits records on record/unit separators', () => {
    const output = [
      'abc123\u001fAlice\u001f2026-08-01\u001fInitial commit\u001e',
      'def456\u001fBob\u001f2026-08-02\u001fFix bug\u001e',
    ].join('')
    const commits = parseLog(output)
    expect(commits).toHaveLength(2)
    expect(commits[0]).toEqual({ hash: 'abc123', author: 'Alice', date: '2026-08-01', subject: 'Initial commit' })
    expect(commits[1].subject).toBe('Fix bug')
  })
})

describe('package tooling (no external commands)', () => {
  test('read-package-scripts reports missing package.json', async () => {
    setupRepoHandlers(makeStorageManager([]), makeProcessManager(), makeWindow())
    const result = await ipcMain._handlers.get('read-package-scripts')(fakeEvent, tempRoot)
    expect(result).toEqual({ success: true, hasPackageJson: false, scripts: [], packageManager: null })
  })

  test('read-package-scripts lists sorted scripts', async () => {
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({ scripts: { build: 'vite build', dev: 'vite' } }))
    setupRepoHandlers(makeStorageManager([]), makeProcessManager(), makeWindow())
    const result = await ipcMain._handlers.get('read-package-scripts')(fakeEvent, tempRoot)
    expect(result.hasPackageJson).toBe(true)
    expect(result.scripts).toEqual([
      { name: 'build', command: 'vite build' },
      { name: 'dev', command: 'vite' },
    ])
  })

  test('check-dependencies detects lockfile, node_modules and counts', async () => {
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
      dependencies: { react: '^18' },
      devDependencies: { vitest: '^1' },
      scripts: { dev: 'vite' },
    }))
    fs.writeFileSync(path.join(tempRoot, 'pnpm-lock.yaml'), '')
    fs.mkdirSync(path.join(tempRoot, 'node_modules'))
    setupRepoHandlers(makeStorageManager([]), makeProcessManager(), makeWindow())
    const result = await ipcMain._handlers.get('check-dependencies')(fakeEvent, tempRoot)
    expect(result).toMatchObject({
      success: true,
      hasPackageJson: true,
      hasNodeModules: true,
      lockfile: 'pnpm-lock.yaml',
      packageManager: 'pnpm',
      scriptCount: 1,
      depCount: 2,
    })
  })

  test('npm-outdated without package.json short-circuits', async () => {
    setupRepoHandlers(makeStorageManager([]), makeProcessManager(), makeWindow())
    const result = await ipcMain._handlers.get('npm-outdated')(fakeEvent, tempRoot)
    expect(result).toEqual({ success: true, hasPackageJson: false, outdated: [] })
  })

  test('npm-update rejects unsafe package names before touching anything', async () => {
    fs.writeFileSync(path.join(tempRoot, 'package.json'), '{}')
    setupRepoHandlers(makeStorageManager([]), makeProcessManager(), makeWindow())
    const result = await ipcMain._handlers.get('npm-update')(fakeEvent, tempRoot, 'lodash; rm -rf /')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid package name/)
    expect(fs.readdirSync(tempRoot)).toEqual(['package.json'])
  })

  test('run-project-script runs a valid script and reports missing ones', async () => {
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    const pm = makeProcessManager()
    setupRepoHandlers(makeStorageManager([project('app', tempRoot)]), pm, makeWindow())

    const ok = await ipcMain._handlers.get('run-project-script')(fakeEvent, 'app', 'dev')
    expect(ok.success).toBe(true)
    expect(pm.runCustomCommand).toHaveBeenCalledWith('app', tempRoot, 'script:dev', 'dev', 'npm run dev', {}, expect.any(Function))

    const missingScript = await ipcMain._handlers.get('run-project-script')(fakeEvent, 'app', 'nope')
    expect(missingScript.success).toBe(false)
    expect(missingScript.error).toMatch(/not found/)

    const missingProject = await ipcMain._handlers.get('run-project-script')(fakeEvent, 'ghost', 'dev')
    expect(missingProject.success).toBe(false)
    expect(missingProject.error).toMatch(/not found/)
  })

  test('install-dependencies delegates through the process manager', async () => {
    fs.writeFileSync(path.join(tempRoot, 'package.json'), '{}')
    const pm = makeProcessManager()
    setupRepoHandlers(makeStorageManager([project('app', tempRoot)]), pm, makeWindow())
    const result = await ipcMain._handlers.get('install-dependencies')(fakeEvent, 'app')
    expect(result.success).toBe(true)
    expect(result.packageManager).toBe('npm')
    expect(pm.runCustomCommand).toHaveBeenCalled()
  })
})

describe('git channels (validation paths + real temp repos)', () => {
  test('git validation errors return clean envelopes', async () => {
    setupRepoHandlers(makeStorageManager([]), makeProcessManager(), makeWindow())
    const handlers = ipcMain._handlers

    expect((await handlers.get('git-commit')(fakeEvent, tempRoot, '   ')).error).toMatch(/required/)
    expect((await handlers.get('git-commit')(fakeEvent, tempRoot, 'x'.repeat(2001))).error).toMatch(/too long/)
    expect((await handlers.get('git-stage')(fakeEvent, tempRoot, 'file.js')).error).toMatch(/array/)
    expect((await handlers.get('git-diff')(fakeEvent, tempRoot, '')).error).toMatch(/required/)
    expect((await handlers.get('git-discard')(fakeEvent, tempRoot, '')).error).toMatch(/required/)
    expect((await handlers.get('git-blame')(fakeEvent, tempRoot, '')).error).toMatch(/required/)
    expect((await handlers.get('git-checkout')(fakeEvent, tempRoot, 'bad branch!')).error).toMatch(/Invalid branch name/)
  })

  test('git-status on a non-repo reports isRepo:false', async () => {
    setupRepoHandlers(makeStorageManager([]), makeProcessManager(), makeWindow())
    const result = await ipcMain._handlers.get('git-status')(fakeEvent, tempRoot)
    expect(result.success).toBe(true)
    expect(result.isRepo).toBe(false)
  })

  test('full git flow in a real temp repo', async () => {
    execFileSync('git', ['init', '-q'], { cwd: tempRoot })
    // CI runners have no global git identity — without it `git commit` fails
    // with "Please tell me who you are". Set a local identity for the repo.
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempRoot })
    execFileSync('git', ['config', 'user.name', 'DevLauncher Test'], { cwd: tempRoot })
    fs.writeFileSync(path.join(tempRoot, 'a.txt'), 'hello')
    setupRepoHandlers(makeStorageManager([]), makeProcessManager(), makeWindow())
    const handlers = ipcMain._handlers

    const status = await handlers.get('git-status')(fakeEvent, tempRoot)
    expect(status.success).toBe(true)
    expect(typeof status.branch).toBe('string')

    const staged = await handlers.get('git-stage')(fakeEvent, tempRoot, ['a.txt'])
    expect(staged.success).toBe(true)

    // Staged diff contains the new content before committing.
    const stagedDiff = await handlers.get('git-diff')(fakeEvent, tempRoot, 'a.txt', true)
    expect(stagedDiff.success).toBe(true)
    expect(stagedDiff.diff).toContain('hello')

    const commit = await handlers.get('git-commit')(fakeEvent, tempRoot, 'initial')
    expect(commit.success).toBe(true)

    const log = await handlers.get('git-log')(fakeEvent, tempRoot, 10)
    expect(log.success).toBe(true)
    expect(log.commits.length).toBeGreaterThan(0)
    expect(log.commits[0].subject).toBe('initial')
  })

  test('readPackageJson returns null for invalid JSON', () => {
    fs.writeFileSync(path.join(tempRoot, 'package.json'), '{broken')
    expect(readPackageJson(tempRoot)).toBeNull()
  })
})
