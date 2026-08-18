import { spawn } from 'child_process'
import { ProcessMetricsBase } from './processMetricsBase'
import Logger from '../utils/logger'
const log = Logger || { info: () => {}, warn: () => {}, error: () => {} }
import {
  STATUS as PROCESS_STATUS,
  stubProcessData,
} from './processTypes'
import type {
  ChildProcessData,
  CommandSnapshot,
  CustomRun,
  ErrorCallback,
  ExitCallback,
  LaunchCommand,
  LogCallback,
  ProcessData,
  ReadyCallback,
  STATUS,
} from './processTypes'

/**
 * ProcessManager - owns the per-project process lifecycle (spawn, stop,
 * restart, custom commands) and exposes status/log/metrics through the
 * inherited bases: ProcessLogBase (log buffer), ProcessPortBase (port
 * checks), ProcessChildBase (composite readiness/exit/auto-restart) and
 * ProcessMetricsBase (resource monitoring).
 */
class ProcessManager extends ProcessMetricsBase {
  processes: Map<string, ProcessData>
  autoRestartConfig: Record<string, unknown> | null
  customRuns: Map<number, CustomRun>
  nextRunId: number
  STATUS: typeof STATUS

  constructor() {
    super()
    this.processes = new Map() // projectId -> process data
    // Auto-restart preferences — assigned externally from the workspace config.
    this.autoRestartConfig = null
    this.customRuns = new Map() // runId -> { projectId, commandId, label, process }
    this.nextRunId = 1
    this.STATUS = PROCESS_STATUS
  }

  /**
   * Start a project process
   * @param projectId Project ID
   * @param projectPath Project directory path
   * @param command Command to execute (string or launch command descriptors)
   * @param env Environment variables
   * @param port Primary port (used when command is a plain string)
   */
  async startProcess(
    projectId: string,
    projectPath: string,
    command: string | LaunchCommand[],
    env: Record<string, string> = {},
    port: number | null = null,
    onLog?: LogCallback,
    onExit?: ExitCallback,
    onError?: ErrorCallback,
    onReady?: ReadyCallback
  ) {
    // Validate required parameters
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!projectPath) {
      throw new Error('Project path is required')
    }
    const commands: LaunchCommand[] = Array.isArray(command)
      ? command.map((item) => ({ ...item }))
      : [{ id: 'main', name: 'Application', command, port, primary: true }]
    if (!commands.length || commands.some((item) => !item.command || !item.command.trim())) throw new Error('Start command is required')
    const commandIds = new Set()
    const ports = new Set()
    for (const item of commands) {
      if (!item.id || commandIds.has(item.id)) throw new Error(`Duplicate process command: ${item.id || '(missing id)'}`)
      commandIds.add(item.id)
      if (item.port !== null && item.port !== undefined) {
        if (!Number.isInteger(item.port) || item.port < 1 || item.port > 65535) throw new Error('Port must be an integer between 1 and 65535')
        if (ports.has(item.port)) throw new Error(`Port ${item.port} is configured more than once`)
        ports.add(item.port)
      }
    }
    if (commands.filter((item) => item.primary).length !== 1) throw new Error('Process commands require exactly one primary command')

    // Check if already running or starting
    if (this.processes.has(projectId)) {
      const processData = this.processes.get(projectId)!
      if (([this.STATUS.RUNNING, this.STATUS.STARTING, this.STATUS.STOPPING] as string[]).includes(processData.status)) {
        throw new Error(`Project ${projectId} is already active`)
      }
    }

    for (const item of commands) if (item.port !== null && item.port !== undefined && await this.isPortOpen(item.port)) throw new Error(`Port ${item.port} is already in use`)

    // Readiness window. First build/compile (e.g. `go run .` downloading modules +
    // compiling) routinely takes longer than the old 30s default; give Go toolchain
    // commands 2 minutes and everything else 1 minute.
    const primaryCommand = (commands.find((item) => item.primary) || commands[0]).command.toLowerCase()
    const readyTimeoutMs = /\bgo\s+(run|build|test|install)\b/.test(primaryCommand) ? 120000 : 60000

    try {
      log.info('ProcessManager', 'Starting process', { projectId, projectPath, commands })

      const persistedLogs = await this.loadPersistedLogs(projectId, this.maxLogLines)

      const processData: ProcessData = {
        pid: null,
        status: this.STATUS.STARTING,
        startedAt: Date.now(),
        logs: persistedLogs,
        command: commands.find((item) => item.primary)?.command || commands[0].command,
        projectPath,
        port: commands.find((item) => item.primary)?.port ?? null,
        launchCommands: commands,
        runId: Symbol(projectId),
        commands: new Map(),
        onExit,
        onError,
        onReady,
        onLog,
        env,
        restartCount: 0,
        readyTimeoutMs,
      }
      this.processes.set(projectId, processData)
      this.emit('status-change', { projectId, status: 'starting' })

      const spawnCommand = (descriptor: LaunchCommand) => new Promise<ChildProcessData>((resolve, reject) => {
        const childProcess = spawn(descriptor.command, { cwd: projectPath, env: { ...process.env, ...env }, shell: true, detached: process.platform !== 'win32', windowsHide: false })
        const child: ChildProcessData = { ...descriptor, status: this.STATUS.STARTING, process: childProcess, pid: childProcess.pid ?? null, ready: descriptor.port === null || descriptor.port === undefined }
        processData.commands.set(descriptor.id, child)
        if (descriptor.primary) { processData.pid = child.pid; processData.process = childProcess }
        const handleOutput = (data: Buffer, type: string) => {
          const entry = this.addLog(projectId, data.toString(), type, descriptor.id, descriptor.name)
          if (onLog && entry) onLog(projectId, entry)
        }
        childProcess.stdout?.on('data', (data: Buffer) => handleOutput(data, 'stdout'))
        childProcess.stderr?.on('data', (data: Buffer) => handleOutput(data, 'stderr'))
        childProcess.once('error', (error: Error) => {
          this.failComposite(projectId, processData.runId, child, error, onError)
          reject(error)
        })
        childProcess.once('exit', (code: number | null, signal: NodeJS.Signals | null) => this.handleChildExit(projectId, processData.runId, child, code, signal, onExit, onError))
        childProcess.once('spawn', () => resolve(child))
      })

      await Promise.all(commands.map(spawnCommand))
      setTimeout(() => {
        this.waitForCompositeReady(projectId, processData.runId).catch((error) => {
          this.failComposite(projectId, processData.runId, null, error, onError)
        })
      }, 0)
      return { success: true, pid: processData.pid, status: processData.status, commands: this.getCommandSnapshot(processData) }
    } catch (error) {
      const current = this.processes.get(projectId)
      if (current?.runId) {
        this.failComposite(projectId, current.runId, null, error as Error, onError)
      } else {
        this.processes.set(projectId, stubProcessData('', this.STATUS.ERROR, (error as Error).message))
      }
      throw error
    }
  }

  getCommandSnapshot(processData: ProcessData): CommandSnapshot[] {
    return [...(processData?.commands?.values() || [])].map((item) => ({ id: item.id, name: item.name, command: item.command, port: item.port ?? null, primary: item.primary, status: item.status, pid: item.pid, ready: item.ready }))
  }

  /**
   * Run a one-off custom command for a project (no readiness/status tracking).
   * Output is forwarded to the project log buffer and onLog callback.
   */
  async runCustomCommand(
    projectId: string,
    projectPath: string,
    commandId: string,
    label: string,
    command: string,
    env: Record<string, string> = {},
    onLog?: LogCallback
  ) {
    if (!projectId || !projectPath) throw new Error('Project id and path are required')
    if (typeof command !== 'string' || !command.trim()) throw new Error('Command is required')

    const runId = this.nextRunId++
    const childProcess = spawn(command.trim(), {
      cwd: projectPath,
      env: { ...process.env, ...env },
      shell: true,
      detached: process.platform !== 'win32',
      windowsHide: false,
    })

    this.customRuns.set(runId, { projectId, commandId, label: label || commandId, process: childProcess, pid: childProcess.pid ?? null })

    // Ensure a process entry exists so logs are captured/persisted for this project
    if (!this.processes.has(projectId)) {
      this.processes.set(projectId, stubProcessData(projectPath, this.STATUS.STOPPED))
    }

    const handleOutput = (data: Buffer, type: string) => {
      const entry = this.addLog(projectId, data.toString(), type, commandId, label || commandId)
      if (onLog && entry) onLog(projectId, entry)
    }
    childProcess.stdout?.on('data', (data: Buffer) => handleOutput(data, 'stdout'))
    childProcess.stderr?.on('data', (data: Buffer) => handleOutput(data, 'stderr'))

    childProcess.once('error', (error: Error) => {
      this.customRuns.delete(runId)
      this.addLog(projectId, `Custom command failed: ${error.message}`, 'error', commandId, label)
      if (onLog) onLog(projectId, { id: this.nextLogId - 1 || this.nextLogId, timestamp: new Date().toISOString(), type: 'error', message: `Custom command failed: ${error.message}`, commandId, commandName: label })
    })

    childProcess.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      this.customRuns.delete(runId)
      this.addLog(projectId, `Custom command exited with ${signal ? `signal ${signal}` : `code ${code}`}`, 'system', commandId, label)
      if (onLog) onLog(projectId, { id: this.nextLogId - 1 || this.nextLogId, timestamp: new Date().toISOString(), type: 'system', message: `Custom command exited with ${signal ? `signal ${signal}` : `code ${code}`}`, commandId, commandName: label })
    })

    return { success: true, runId, pid: childProcess.pid }
  }

  async stopCustomCommand(runId: number, force = false) {
    const run = this.customRuns.get(runId)
    if (!run) throw new Error(`Custom command ${runId} not found`)
    try {
      await this.killProcessTree(run.process, force)
    } finally {
      this.customRuns.delete(runId)
    }
    return { success: true, runId, forced: force }
  }

  getCustomRunStatus(runId: number) {
    const run = this.customRuns.get(runId)
    return run ? { runId, pid: run.pid, status: 'running' } : { runId, pid: null, status: 'stopped' }
  }

  async stopAllCustomCommands() {
    const runIds = [...this.customRuns.keys()]
    return Promise.all(runIds.map((runId) => this.stopCustomCommand(runId, true).catch(() => ({ runId, success: false }))))
  }

  /**
   * Stop a project process
   * @param projectId Project ID
   * @param force Force kill (SIGKILL) instead of graceful (SIGTERM)
   */
  async stopProcess(projectId: string, force = false) {
    if (!this.processes.has(projectId)) {
      throw new Error(`Project ${projectId} is not running`)
    }

    const processData = this.processes.get(projectId)!
    if (!([this.STATUS.RUNNING, this.STATUS.STARTING, this.STATUS.ERROR] as string[]).includes(processData.status)) {
      throw new Error(`Project ${projectId} is not running (status: ${processData.status})`)
    }

    processData.status = this.STATUS.STOPPING

    try {
      this.emit('status-change', { projectId, status: 'stopping' })
      const children: ChildProcessData[] = processData.commands
        ? [...processData.commands.values()].filter((item) => item.process && item.pid)
        : [{ id: 'main', name: 'Application', command: processData.command, port: processData.port, status: this.STATUS.STARTING, ready: true, process: processData.process!, pid: processData.pid }].filter((item) => item.process && item.pid)
      if (children.length === 0) {
        processData.status = this.STATUS.STOPPED
        processData.pid = null
        return { success: true, forced: false }
      }

      await Promise.all(children.map(async (child) => {
        child.status = this.STATUS.STOPPING
        try {
          await this.killProcessTree(child.process, force)
        } catch (error) {
          if (force) throw error
          this.addLog(projectId, `Graceful shutdown failed: ${(error as Error).message}`, 'system', child.id, child.name)
          await this.killProcessTree(child.process, true)
        }
        child.status = this.STATUS.STOPPED
        child.pid = null
      }))
      processData.status = this.STATUS.STOPPED
      processData.pid = null
      this.addLog(projectId, force ? 'Processes force killed' : 'Processes stopped', 'system')
      this.emit('status-change', { projectId, status: 'stopped' })
      return { success: true, forced: force }
    } catch (error) {
      processData.status = this.STATUS.ERROR
      processData.error = (error as Error).message
      throw error
    }
  }

  /**
   * Get process status
   * @param projectId Project ID
   */
  getProcessStatus(projectId: string) {
    if (!this.processes.has(projectId)) {
      return { status: this.STATUS.STOPPED, logs: [] }
    }
    const processData = this.processes.get(projectId)!
    return {
      status: processData.status,
      pid: processData.pid,
      startedAt: processData.startedAt,
      logs: processData.logs,
      exitCode: processData.exitCode,
      error: processData.error,
      port: processData.port,
      commands: this.getCommandSnapshot(processData),
    }
  }

  getStatus(projectId: string) {
    return this.getProcessStatus(projectId)
  }

  /**
   * Get all running processes
   */
  getAllProcesses() {
    const result: Record<string, { status: string; pid: number | null; startedAt: number }> = {}
    this.processes.forEach((processData, projectId) => {
      result[projectId] = {
        status: processData.status,
        pid: processData.pid,
        startedAt: processData.startedAt,
      }
    })
    return result
  }

  /**
   * Restart a project process
   * @param projectId Project ID
   * @param projectPath Project directory path
   * @param command Command to execute
   * @param env Environment variables
   */
  async restartProcess(
    projectId: string,
    projectPath: string,
    command: string | LaunchCommand[],
    env: Record<string, string> = {},
    port: number | null = null,
    onLog?: LogCallback,
    onExit?: ExitCallback,
    onError?: ErrorCallback,
    onReady?: ReadyCallback
  ) {
    try {
      // Stop if running
      if (this.processes.has(projectId)) {
        const processData = this.processes.get(projectId)!
        if (([this.STATUS.RUNNING, this.STATUS.STARTING, this.STATUS.ERROR] as string[]).includes(processData.status)) {
          await this.stopProcess(projectId, false)
        }
      }

      // Start again
      return await this.startProcess(
        projectId,
        projectPath,
        command,
        env,
        port,
        onLog,
        onExit,
        onError,
        onReady
      )
    } catch (error) {
      throw error
    }
  }

  /**
   * Stop all running processes
   */
  async stopAllProcesses() {
    const promises: Promise<{ projectId: string; success: boolean; error?: string }>[] = []
    const projectIds: string[] = []
    this.processes.forEach((processData, projectId) => {
      if (([this.STATUS.RUNNING, this.STATUS.STARTING, this.STATUS.ERROR] as string[]).includes(processData.status)) {
        projectIds.push(projectId)
        promises.push(this.stopProcess(projectId, false).then(() => ({ projectId, success: true })).catch((error) => ({ projectId, success: false, error: error.message })))
      }
    })
    const results = await Promise.all(promises)
    return results
  }
}

export default ProcessManager

export type { ProcessManager }
