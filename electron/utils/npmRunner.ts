const { spawn } = require('child_process')

// npm package names (incl. scoped @org/name) never contain shell
// metacharacters — anything else is rejected so shell:true stays
// injection-safe.
const SAFE_PACKAGE_NAME = /^[@A-Za-z0-9][A-Za-z0-9._~+/@-]*$/

/**
 * Validate a package name for `npm install <name>@latest`. Throws for null,
 * blank, non-string, or names containing shell metacharacters.
 */
function assertSafePackageName(packageName: string | null): void {
  if (packageName !== null && (typeof packageName !== 'string' || !SAFE_PACKAGE_NAME.test(packageName.trim()))) {
    throw new Error('Invalid package name')
  }
}

/**
 * Run npm through a shell. On Windows npm is a .cmd shim; recent Node
 * versions throw `spawn EINVAL` when spawning a .cmd directly via
 * execFile/spawn with shell:false, so every npm command must go through a
 * shell (PATHEXT resolves npm.cmd) — same pattern ProcessManager already
 * uses for start commands. `spawnFn` is injectable for tests.
 */
function createNpmRunner(spawnFn: typeof import('child_process').spawn = spawn) {
  return {
    assertSafePackageName,

    execNpm(cwd: string, args: string[], { timeoutMs = 180000 }: { timeoutMs?: number } = {}): Promise<string> {
      return new Promise((resolve, reject) => {
        let settled = false
        let stdout = ''
        let stderr = ''
        let child: ReturnType<typeof spawnFn> | undefined
        try {
          child = spawnFn('npm', args, { cwd, shell: true, windowsHide: true })
        } catch (error) {
          settled = true
          const err = error as NodeJS.ErrnoException
          reject(new Error(`npm could not be started (${err.code || err.message})`))
          return
        }
        child.stdout?.on('data', (data: Buffer) => { stdout += data })
        child.stderr?.on('data', (data: Buffer) => { stderr += data })
        const timer = setTimeout(() => {
          settled = true
          try { child?.kill() } catch { /* already gone */ }
          reject(new Error(`npm ${args[0] || ''} timed out after ${Math.round(timeoutMs / 1000)}s`))
        }, timeoutMs)
        child.on('error', (error: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          const err = error as NodeJS.ErrnoException
          reject(new Error(`npm could not be started (${err.code || err.message})`))
        })
        child.on('close', (code: number | null) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (code !== 0 && code !== 1) {
            // npm outdated exits 1 when packages ARE outdated — that is success.
            reject(new Error((stderr || '').trim().slice(0, 400) || `npm ${args[0] || ''} failed`))
            return
          }
          resolve(stdout)
        })
      })
    },
  }
}

const defaultRunner = createNpmRunner()

export const execNpm = defaultRunner.execNpm
export { assertSafePackageName, createNpmRunner }

