const { spawn } = require('child_process')

/**
 * Generic package-manager runner for tools that have a .cmd shim on Windows
 * (composer, pip, cargo) and binaries that can be spawned directly (go).
 * Like npmRunner, every command goes through a shell so PATHEXT resolves the
 * .cmd shims; `go` is spawned via a shell too for consistency.
 */

interface ExecToolOptions {
  timeoutMs?: number
}

/**
 * Run `tool` with `args` in `cwd` through a shell. Resolves stdout. Rejects on
 * non-zero exit (except an optional list of "ok" codes — e.g. `pip list
 * --outdated`, `npm outdated` exit 1 when anything IS outdated, which is fine).
 */
function createToolRunner(spawnFn: typeof import('child_process').spawn = spawn) {
  return {
    execTool(
      tool: string,
      cwd: string,
      args: string[],
      { timeoutMs = 120000, okCodes = [0] }: ExecToolOptions & { okCodes?: number[] } = {},
    ): Promise<string> {
      return new Promise((resolve, reject) => {
        let settled = false
        let stdout = ''
        let stderr = ''
        let child: ReturnType<typeof spawnFn> | undefined
        const cmd = [tool, ...args].join(' ')
        try {
          child = spawnFn(cmd, { cwd, shell: true, windowsHide: true })
        } catch (error) {
          settled = true
          const err = error as NodeJS.ErrnoException
          reject(new Error(`${tool} could not be started (${err.code || err.message})`))
          return
        }
        child.stdout?.on('data', (data: Buffer) => { stdout += data })
        child.stderr?.on('data', (data: Buffer) => { stderr += data })
        const timer = setTimeout(() => {
          settled = true
          try { child?.kill() } catch { /* already gone */ }
          reject(new Error(`${cmd} timed out after ${Math.round(timeoutMs / 1000)}s`))
        }, timeoutMs)
        child.on('error', (error: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          const err = error as NodeJS.ErrnoException
          reject(new Error(`${tool} could not be started (${err.code || err.message})`))
        })
        child.on('close', (code: number | null) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (code !== null && !okCodes.includes(code)) {
            reject(new Error((stderr || '').trim().slice(0, 400) || `${cmd} failed with exit code ${code}`))
            return
          }
          resolve(stdout)
        })
      })
    },
  }
}

const defaultRunner = createToolRunner()

export const execTool = defaultRunner.execTool
export { createToolRunner }