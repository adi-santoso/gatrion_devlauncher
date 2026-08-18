import type { ChildProcess } from 'child_process'
import { killProcessTree } from '../utils/processTree'
import { ProcessPortBase } from './processPortBase'
import type {
  ChildProcessData,
  ErrorCallback,
  ExitCallback,
  LaunchCommand,
  LogCallback,
  ProcessData,
  ReadyCallback,
  STATUS,
} from './processTypes'

export interface StartResult {
  success: boolean
  pid: number | null
  status: string
  commands: unknown[]
}

/**
 * Composite-process lifecycle: readiness waiting, child exit handling, failure
 * propagation, and auto-restart. Depends on the port base (port checks) and
 * declares the leaf's `startProcess` so auto-restart can relaunch.
 */
export abstract class ProcessChildBase extends ProcessPortBase {
  abstract STATUS: typeof STATUS
  abstract autoRestartConfig: Record<string, unknown> | null

  protected abstract startProcess(
    projectId: string,
    projectPath: string,
    command: string | LaunchCommand[],
    env: Record<string, string>,
    port: number | null,
    onLog?: LogCallback,
    onExit?: ExitCallback,
    onError?: ErrorCallback,
    onReady?: ReadyCallback
  ): Promise<StartResult>

  killProcessTree(childProcess: ChildProcess, force: boolean) {
    return killProcessTree(childProcess, force)
  }

  async waitForCompositeReady(projectId: string, runId: symbol) {
    const data = this.processes.get(projectId)
    if (!data || data.runId !== runId) return
    try {
      const readiness = [...data.commands.values()].map(async (item) => {
        if (item.port === null || item.port === undefined) return
        const ready = await this.waitForCommandPort(projectId, item.port, data.readyTimeoutMs ?? 60000, runId)
        if (!ready) return
        item.ready = true
        item.status = this.STATUS.RUNNING
      })
      await Promise.all(readiness)
      const current = this.processes.get(projectId)
      if (!current || current.runId !== runId || current.status !== this.STATUS.STARTING) return
      current.status = this.STATUS.RUNNING
      current.restartCount = 0
      for (const item of current.commands.values()) if (item.status === this.STATUS.STARTING) item.status = this.STATUS.RUNNING
      this.emit('status-change', { projectId, status: 'running' })
      if (current.onReady) current.onReady(projectId)
    } catch (error) {
      this.failComposite(projectId, runId, null, error as Error, data.onError)
    }
  }

  handleChildExit(projectId: string, runId: symbol, child: ChildProcessData, code: number | null, signal: NodeJS.Signals | null, onExit?: ExitCallback, onError?: ErrorCallback) {
    const data = this.processes.get(projectId)
    if (!data || data.runId !== runId) return
    child.pid = null
    child.exitCode = code
    child.exitSignal = signal || undefined
    if (child.primary) {
      data.exitCode = code
      data.exitSignal = signal || undefined
      data.pid = null
    }
    // An exit while STOPPING is the stop itself; an exit that arrives after
    // STOPPED is a leftover process finally dying (POSIX sends SIGTERM and
    // resolves before the 'exit' event fires, so this race is the norm there).
    // Both are intentional — never treat them as a crash.
    const intentional = data.status === this.STATUS.STOPPING || data.status === this.STATUS.STOPPED
    if (data.status === this.STATUS.ERROR && child.status !== this.STATUS.ERROR) {
      child.status = this.STATUS.STOPPED
      return
    }
    if (!intentional && (data.commands.size > 1 || code !== 0)) {
      this.failComposite(projectId, runId, child, new Error(`${child.name} exited with ${signal ? `signal ${signal}` : `code ${code}`}`), onError)
      return
    }
    child.status = intentional || code === 0 ? this.STATUS.STOPPED : this.STATUS.ERROR
    const allStopped = [...data.commands.values()].every((item) => item.status === this.STATUS.STOPPED)
    if (allStopped) data.status = this.STATUS.STOPPED
    this.emit('status-change', { projectId, status: data.status.toLowerCase() })
    if (onExit && (data.commands.size === 1 || allStopped)) onExit(projectId, code, signal)
  }

  failComposite(projectId: string, runId: symbol, failedChild: ChildProcessData | null, error: Error, onError?: ErrorCallback) {
    const data = this.processes.get(projectId)
    if (!data || data.runId !== runId || data.status === this.STATUS.ERROR || data.status === this.STATUS.STOPPING) return
    data.status = this.STATUS.ERROR
    data.error = error.message
    if (failedChild) failedChild.status = this.STATUS.ERROR
    this.addLog(projectId, error.message, 'error', failedChild?.id, failedChild?.name)
    this.emit('status-change', { projectId, status: 'error' })
    if (onError) onError(projectId, error)
    for (const child of data.commands.values()) {
      if (child.process && child.pid) this.killProcessTree(child.process, true).catch(() => {})
      if (child !== failedChild) child.status = this.STATUS.STOPPING
    }

    this.maybeAutoRestart(projectId, runId, data)
  }

  maybeAutoRestart(projectId: string, runId: symbol, data: ProcessData) {
    if (!this.autoRestartConfig?.enabled) return
    if (!data.projectPath || !data.command) return
    const rawMaxRetries = this.autoRestartConfig?.maxRetries
    const maxRetries = typeof rawMaxRetries === 'number' && Number.isInteger(rawMaxRetries) ? rawMaxRetries : 3
    if (data.restartCount >= maxRetries) {
      this.addLog(projectId, `Auto-restart disabled: max retries (${maxRetries}) reached`, 'system')
      return
    }

    const rawDelay = this.autoRestartConfig?.delayMs
    const delay = typeof rawDelay === 'number' && Number.isInteger(rawDelay) ? rawDelay : 2000
    const backoffDelay = delay * Math.pow(2, data.restartCount)
    data.restartCount += 1

    // Reuse the full command set (composite projects must restart with every command, not just the primary)
    const launchCommands = Array.isArray(data.launchCommands) ? data.launchCommands : data.command
    const portsToFree = Array.isArray(data.launchCommands)
      ? data.launchCommands.map((item) => item.port).filter((port) => port != null)
      : data.port != null ? [data.port] : []

    this.addLog(projectId, `Auto-restarting in ${Math.round(backoffDelay / 1000)}s (attempt ${data.restartCount}/${maxRetries})...`, 'system')

    setTimeout(async () => {
      const current = this.processes.get(projectId)
      if (!current || current.runId !== runId || current.status === this.STATUS.STOPPING || current.status === this.STATUS.STOPPED) {
        return
      }

      // Wait for the previous process tree to release its ports before relaunching
      const freed = await this.waitForPortsFree(portsToFree, 10000)
      const live = this.processes.get(projectId)
      if (!live || live.runId !== runId || live.status === this.STATUS.STOPPING || live.status === this.STATUS.STOPPED) {
        return
      }
      if (!freed && portsToFree.length > 0) {
        this.addLog(projectId, `Auto-restart waiting for ports ${portsToFree.join(', ')} to be released`, 'system')
      }

      this.startProcess(
        projectId,
        data.projectPath,
        launchCommands,
        data.env || {},
        data.port,
        data.onLog,
        data.onExit,
        data.onError,
        data.onReady
      ).catch((restartError) => {
        this.addLog(projectId, `Auto-restart failed: ${restartError.message}`, 'error')
      })
    }, backoffDelay)
  }
}
