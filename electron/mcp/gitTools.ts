/**
 * Git operations used by the MCP `devlauncher_*` tools. Mirrors the semantics
 * of the IPC git handlers (repoHandlers.ts) so the agent's view of a repo is
 * consistent with the UI — same porcelain parsing, same fail-fast policy.
 */
const { execFile } = require('child_process')

export function runGit(cwd: string, args: string[], { timeoutMs = 30000 }: { timeoutMs?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      reject(new Error(`git ${args[0] || ''} timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)
    execFile(
      'git',
      args,
      { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error: Error | null, stdout: string, stderr: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) {
          reject(new Error((stderr || error.message || '').trim() || `git ${args[0] || ''} failed`))
          return
        }
        resolve(stdout)
      }
    )
  })
}

const STATUS_LABELS: Record<string, string> = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied', U: 'unmerged', T: 'type change', '?': 'untracked' }

function cleanPath(raw: unknown): string {
  let value = String(raw ?? '').trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    try { value = JSON.parse(value) } catch { /* keep raw */ }
  }
  const arrow = value.indexOf(' -> ')
  return arrow !== -1 ? value.slice(arrow + 4) : value
}

export interface GitStatus {
  isRepo: boolean
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  staged: Array<{ path: string; label: string }>
  unstaged: Array<{ path: string; label: string }>
  untracked: string[]
}

function parseStatus(output: string): Omit<GitStatus, 'isRepo'> {
  const result: Omit<GitStatus, 'isRepo'> = { branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }
  for (const line of output.split('\n')) {
    if (!line) continue
    if (line.startsWith('## ')) {
      const rest = line.slice(3)
      const sep = rest.indexOf('...')
      const localPart = sep === -1 ? rest : rest.slice(0, sep)
      const remotePart = sep === -1 ? null : rest.slice(sep + 3)
      result.branch = localPart.split(' ')[0] || null
      if (remotePart) {
        result.upstream = remotePart.split(' ')[0] || null
        const aheadMatch = /ahead (\d+)/.exec(remotePart)
        const behindMatch = /behind (\d+)/.exec(remotePart)
        result.ahead = aheadMatch ? Number(aheadMatch[1]) : 0
        result.behind = behindMatch ? Number(behindMatch[1]) : 0
      }
      continue
    }
    const xy = line.slice(0, 2)
    const file = cleanPath(line.slice(3))
    if (xy === '??') { result.untracked.push(file); continue }
    const stagedCode = xy[0]
    const unstagedCode = xy[1]
    if (stagedCode !== ' ' && stagedCode !== '?') result.staged.push({ path: file, label: STATUS_LABELS[stagedCode] || 'changed' })
    if (unstagedCode !== ' ' && unstagedCode !== '?') result.unstaged.push({ path: file, label: STATUS_LABELS[unstagedCode] || 'changed' })
  }
  return result
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  try {
    await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
    const output = await runGit(cwd, ['status', '--porcelain=v1', '-b', '--untracked-files=all'])
    return { isRepo: true, ...parseStatus(output) }
  } catch (error) {
    if (error instanceof Error && /not a git repository/i.test(error.message)) {
      return { isRepo: false, branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }
    }
    throw error
  }
}

export async function gitLog(cwd: string, limit = 15): Promise<Array<{ hash: string; author: string; date: string; subject: string }>> {
  const safe = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 15
  const output = await runGit(cwd, ['log', `-${safe}`, '--format=%h%x1f%an%x1f%ad%x1f%s%x1e', '--date=short'])
  return output.split('\x1e').filter(Boolean).map((line) => {
    const [hash, author, date, subject] = line.split('\x1f')
    return { hash, author, date, subject }
  })
}

export async function gitDiff(cwd: string, filePath: string, staged = false): Promise<string> {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('A file path is required')
  const args = ['diff', '--color=never']
  if (staged) args.push('--cached')
  args.push('--', filePath)
  return runGit(cwd, args)
}

export async function gitStage(cwd: string, files: unknown): Promise<void> {
  const list = Array.isArray(files)
    ? files.filter((f) => typeof f === 'string' && f.trim().length > 0).slice(0, 500)
    : []
  const args = list.length === 0 ? ['add', '-A'] : ['add', '--', ...list]
  await runGit(cwd, args)
}

export async function gitUnstage(cwd: string, files: unknown): Promise<void> {
  const list = Array.isArray(files)
    ? files.filter((f) => typeof f === 'string' && f.trim().length > 0).slice(0, 500)
    : []
  const args = list.length === 0 ? ['reset'] : ['reset', '--', ...list]
  await runGit(cwd, args)
}

export async function gitCommit(cwd: string, message: unknown): Promise<string> {
  if (typeof message !== 'string' || !message.trim()) throw new Error('Commit message is required')
  if (message.length > 2000) throw new Error('Commit message is too long')
  const output = await runGit(cwd, ['commit', '-m', message])
  return output.trim()
}

export async function gitPull(cwd: string): Promise<string> {
  const output = await runGit(cwd, ['pull'], { timeoutMs: 90000 })
  return output.trim()
}

export async function gitPush(cwd: string): Promise<string> {
  const output = await runGit(cwd, ['push'], { timeoutMs: 90000 })
  return output.trim()
}

export async function gitCheckout(cwd: string, branch: unknown, createNew = false): Promise<void> {
  if (typeof branch !== 'string' || !branch.trim()) throw new Error('Branch name is required')
  if (branch.length > 200 || /[^\w./-]/.test(branch)) throw new Error('Invalid branch name')
  await runGit(cwd, createNew ? ['checkout', '-b', branch] : ['checkout', branch])
}

export async function gitStashList(cwd: string): Promise<Array<{ ref: string; message: string }>> {
  const output = await runGit(cwd, ['stash', 'list'])
  return output.split('\n').filter(Boolean).map((line) => {
    const colon = line.indexOf(': ')
    return { ref: line.slice(0, colon === -1 ? line.length : colon), message: colon === -1 ? line : line.slice(colon + 2) }
  })
}

export async function gitStashPush(cwd: string, message: unknown): Promise<string> {
  const cleanMessage = typeof message === 'string' ? message.trim() : ''
  if (cleanMessage.length > 200) throw new Error('Stash message is too long')
  const args = ['stash', 'push']
  if (cleanMessage) args.push('-m', cleanMessage)
  const output = await runGit(cwd, args)
  return output.trim()
}

export async function gitStashPop(cwd: string, index = 0): Promise<string> {
  const safe = Number.isInteger(index) && index >= 0 ? index : 0
  const output = await runGit(cwd, ['stash', 'pop', `stash@{${safe}}`])
  return output.trim()
}

export async function gitDiscard(cwd: string, filePath: unknown): Promise<void> {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('A file path is required')
  await runGit(cwd, ['checkout', '--', filePath])
}
