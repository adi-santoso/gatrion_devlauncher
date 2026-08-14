import type { ChildProcess } from 'child_process'

const { spawn, exec } = require('child_process')
const util = require('util')
const { EventEmitter } = require('events')
const execAsync = util.promisify(exec)
import Logger from '../utils/logger'
const log = Logger || { info: () => {}, warn: () => {}, error: () => {} }
import { isPortOpen } from '../utils/portCheck'
import { killProcessTree, getProcessResources, getProcessTreeResources } from '../utils/processTree'
import { logFilePath, appendEntry, readEntries, truncate, clear } from '../utils/logStore'

interface LaunchCommand {
  id: string
  name: string
  command: string
  port: number | null
  primary?: boolean
}

interface LogObject {
  id: number
  timestamp: string
  type: string
  message: string
  commandId: string | null
  commandName: string | null
}

interface ChildProcessData extends LaunchCommand {
  status: string
  process: ChildProcess
  pid: number | null
  ready: boolean
  exitCode?: number | null
  exitSignal?: string | null
}

interface ProcessData {
  pid: number | null
  status: string
  startedAt: number
  logs: LogObject[]
  command: string
  projectPath: string
  port: number | null
  launchCommands: LaunchCommand[]
  runId: symbol
  commands: Map<string, ChildProcessData>
  onExit?: ExitCallback
  onError?: ErrorCallback
  onReady?: ReadyCallback
  onLog?: LogCallback
  env: Record<string, string>
  restartCount: number
  error?: string
  exitCode?: number | null
  exitSignal?: string | null
  process?: ChildProcess
  uptime?: string
  memory?: number
  cpu?: number
  cachedMemoryMb?: number
  lastMetricsTime?: number
  isFetchingMetrics?: boolean
}

interface CustomRun {
  projectId: string
  commandId: string
  label: string
  process: ChildProcess
  pid: number
}

type LogCallback = (projectId: string, entry: LogObject) => void
type ExitCallback = (projectId: string, code: number | null, signal: NodeJS.Signals | null) => void
type ErrorCallback = (projectId: string, error: Error) => void
type ReadyCallback = (projectId: string) => void

const STATUS = {
  STOPPED: 'STOPPED',
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  STOPPING: 'STOPPING',
  ERROR: 'ERROR',
} as const

function stubProcessData(projectPath: string, status: string, error?: string): ProcessData {
  return {
    pid: null,
    status,
    startedAt: Date.now(),
    logs: [],
    command: '',
    projectPath,
    port: null,
    launchCommands: [],
    runId: Symbol('stub'),
    commands: new Map(),
    env: {},
    restartCount: 0,
    error,
  }
}

class ProcessManager extends EventEmitter {
  processes: Map<string, ProcessData>
  nextLogId: number
  maxLogLines: number
  logsDir: string | null
  autoRestartConfig: Record<string, any> | null
  customRuns: Map<number, CustomRun>
  nextRunId: number
  resourceMonitorInterval: ReturnType<typeof setInterval> | null
  STATUS: typeof STATUS

  constructor() {
    super()
    this.processes = new Map() // projectId -> process data
    this.nextLogId = 1
    this.maxLogLines = 1000
    this.logsDir = null
    // Auto-restart preferences — assigned externally from the workspace config.
    this.autoRestartConfig = null
    this.customRuns = new Map() // runId -> { projectId, commandId, label, process }
    this.nextRunId = 1
    this.resourceMonitorInterval = null
    this.STATUS = STATUS
  }

  setLogsDir(dir: string | null) {
    this.logsDir = dir
  }

  getLogFilePath(projectId: string) {
    return logFilePath(this.logsDir, projectId)
  }

  async persistLog(projectId: string, entry: LogObject) {
    await appendEntry(this.getLogFilePath(projectId), entry)
  }

  async loadPersistedLogs(projectId: string, limit: number | null = null) {
    const parsed = (await readEntries(this.getLogFilePath(projectId))) as unknown as LogObject[]
    for (const entry of parsed) entry.id = this.nextLogId++
    const safeLimit = typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? Math.min(limit, this.maxLogLines) : this.maxLogLines
    return parsed.slice(-safeLimit)
  }

  async truncateLogFile(projectId: string) {
    await truncate(this.getLogFilePath(projectId), this.maxLogLines)
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
      }
      this.processes.set(projectId, processData)
      this.emit('status-change', { projectId, status: 'starting' })

      const spawnCommand = (descriptor: LaunchCommand) => new Promise<ChildProcessData>((resolve, reject) => {
        const childProcess = spawn(descriptor.command, { cwd: projectPath, env: { ...process.env, ...env }, shell: true, detached: process.platform !== 'win32', windowsHide: false })
        const child: ChildProcessData = { ...descriptor, status: this.STATUS.STARTING, process: childProcess, pid: childProcess.pid, ready: descriptor.port === null || descriptor.port === undefined }
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

  getCommandSnapshot(processData: ProcessData) {
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

    this.customRuns.set(runId, { projectId, commandId, label: label || commandId, process: childProcess, pid: childProcess.pid })

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

  async waitForCompositeReady(projectId: string, runId: symbol) {
    const data = this.processes.get(projectId)
    if (!data || data.runId !== runId) return
    try {
      const readiness = [...data.commands.values()].map(async (item) => {
        if (item.port === null || item.port === undefined) return
        const ready = await this.waitForCommandPort(projectId, item.port, 30000, runId)
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

  async waitForPortsFree(ports: (number | null | undefined)[], timeout = 10000) {
    const uniquePorts = [...new Set((ports || []).filter((port): port is number => Number.isInteger(port) && (port as number) > 0))]
    if (uniquePorts.length === 0) return true
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const occupied = []
      for (const port of uniquePorts) {
        if (await this.isPortOpen(port)) occupied.push(port)
      }
      if (occupied.length === 0) return true
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return false
  }

  maybeAutoRestart(projectId: string, runId: symbol, data: ProcessData) {
    if (!this.autoRestartConfig?.enabled) return
    if (!data.projectPath || !data.command) return
    const maxRetries = Number.isInteger(this.autoRestartConfig.maxRetries) ? this.autoRestartConfig.maxRetries : 3
    if (data.restartCount >= maxRetries) {
      this.addLog(projectId, `Auto-restart disabled: max retries (${maxRetries}) reached`, 'system')
      return
    }

    const delay = Number.isInteger(this.autoRestartConfig.delayMs) ? this.autoRestartConfig.delayMs : 2000
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

  isPortOpen(port: number, timeout = 250) {
    return isPortOpen(port, timeout)
  }

  async waitForCommandPort(projectId: string, port: number, timeout = 30000, runId: symbol | null = null) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const processData = this.processes.get(projectId)
      if (!processData || processData.status !== this.STATUS.STARTING || (runId && processData.runId !== runId)) {
        return false
      }
      if (await this.isPortOpen(port)) return true
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(`Timed out waiting for port ${port}`)
  }

  async waitForPort(projectId: string, port: number, timeout = 30000, runId: symbol | null = null, commandId: string | null = null) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const processData = this.processes.get(projectId)
      if (!processData || processData.status !== this.STATUS.STARTING || (runId && processData.runId !== runId)) {
        return false
      }
      if (await this.isPortOpen(port)) {
        if (!commandId) {
          processData.status = this.STATUS.RUNNING
          this.emit('status-change', { projectId, status: 'running' })
        }
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(`Timed out waiting for port ${port}`)
  }

  /**
   * Check if a port is in use and find its owner PID + process name
   * @param port TCP Port
   */
  async findPortOwner(port: number) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { inUse: false }
    }
    const isOpen = await this.isPortOpen(port)
    if (!isOpen) {
      return { inUse: false }
    }

    try {
      const { stdout } = await execAsync(`netstat -ano -p tcp`, { timeout: 2500 })
      const lines = stdout.split('\n')
      const targetPattern = new RegExp(`:${port}\\s+.*LISTENING\\s+(\\d+)`, 'i')
      let foundPid: number | null = null

      for (const line of lines) {
        const match = line.match(targetPattern)
        if (match && match[1]) {
          foundPid = parseInt(match[1], 10)
          break
        }
      }

      if (!foundPid) {
        return { inUse: true, pid: null, processName: 'Unknown Process' }
      }

      // Check if managed by DevLauncher
      let isManaged = false
      let managedProjectName: string | null = null
      for (const [pId, pData] of this.processes.entries()) {
        if (pData.pid === foundPid || (pData.port === port && pData.status === this.STATUS.RUNNING)) {
          isManaged = true
          managedProjectName = pId
          break
        }
      }

      let processName = 'Unknown Process'
      try {
        const { stdout: tasklistOut } = await execAsync(`tasklist /FI "PID eq ${foundPid}" /FO CSV /NH`, { timeout: 2000 })
        const csvMatch = tasklistOut.match(/^"([^"]+)"/)
        if (csvMatch && csvMatch[1]) {
          processName = csvMatch[1]
        }
      } catch {
        // Fallback
      }

      return {
        inUse: true,
        pid: foundPid,
        processName,
        isManaged,
        managedProjectName
      }
    } catch {
      return { inUse: true, pid: null, processName: 'Occupied Port' }
    }
  }

  /**
   * Get real-time resource metrics (uptime, memory MB, status) for a managed project
   * @param projectId Project ID
   */
  async getProcessMetrics(projectId: string) {
    const processData = this.processes.get(projectId)
    if (!processData || !processData.pid) {
      return {
        status: processData?.status ? processData.status.toLowerCase() : 'stopped',
        pid: null,
        uptime: null,
        memoryMb: null,
        cpuPercent: null
      }
    }

    const pid = processData.pid
    const now = Date.now()
    const uptimeSec = Math.max(0, Math.floor((now - (processData.startedAt || now)) / 1000))

    let uptimeStr = `${uptimeSec}s`
    if (uptimeSec >= 3600) {
      const h = Math.floor(uptimeSec / 3600)
      const m = Math.floor((uptimeSec % 3600) / 60)
      uptimeStr = `${h}h ${m}m`
    } else if (uptimeSec >= 60) {
      const m = Math.floor(uptimeSec / 60)
      const s = uptimeSec % 60
      uptimeStr = `${m}m ${s}s`
    }

    processData.uptime = uptimeStr

    // Throttle CLI tasklist execution to at most once every 5000ms per project
    const lastCheck = processData.lastMetricsTime || 0
    if (now - lastCheck < 5000 && processData.cachedMemoryMb !== undefined) {
      return {
        status: (processData.status || 'stopped').toLowerCase(),
        pid,
        uptime: uptimeStr,
        uptimeSec,
        memoryMb: processData.memory ?? processData.cachedMemoryMb,
        cpuPercent: processData.cpu ?? null
      }
    }

    // Skip if another tasklist check is currently in-flight
    if (processData.isFetchingMetrics) {
      return {
        status: (processData.status || 'stopped').toLowerCase(),
        pid,
        uptime: uptimeStr,
        uptimeSec,
        memoryMb: processData.memory ?? processData.cachedMemoryMb ?? null,
        cpuPercent: processData.cpu ?? null
      }
    }

    processData.isFetchingMetrics = true
    processData.lastMetricsTime = now

    try {
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { timeout: 1500 })
      const match = stdout.match(/^"[^"]+","\d+","[^"]+","\d+","([\d\s,.]+)\s*K"/i)
      if (match && match[1]) {
        const memKbStr = match[1].replace(/[,.\s]/g, '')
        const memKb = parseInt(memKbStr, 10)
        if (!isNaN(memKb)) {
          processData.cachedMemoryMb = Math.round(memKb / 1024)
        }
      }
    } catch {
      // Ignore
    } finally {
      processData.isFetchingMetrics = false
    }

    return {
      status: (processData.status || 'stopped').toLowerCase(),
      pid,
      uptime: uptimeStr,
      uptimeSec,
      memoryMb: processData.memory ?? processData.cachedMemoryMb ?? null,
      cpuPercent: processData.cpu ?? null
    }
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

  killProcessTree(childProcess: ChildProcess, force: boolean) {
    return killProcessTree(childProcess, force)
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
   * Add log line to buffer
   * @param projectId Project ID
   * @param logLine Log line
   * @param type Log type (stdout, stderr, error, system)
   */
  addLog(projectId: string, logLine: string, type = 'stdout', commandId: string | null = null, commandName: string | null = null): LogObject | undefined {
    if (!this.processes.has(projectId)) return

    const processData = this.processes.get(projectId)!
    const timestamp = new Date().toISOString()
    const cleanLine = typeof logLine === 'string'
      ? logLine.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
      : logLine

    const entry: LogObject = {
      id: this.nextLogId++,
      timestamp,
      type,
      message: cleanLine,
      commandId,
      commandName,
    }
    processData.logs.push(entry)

    // Keep only the most recent log lines (bounded to configured max)
    if (processData.logs.length > this.maxLogLines) {
      processData.logs.shift()
    }

    this.persistLog(projectId, entry)

    return entry
  }

  /**
   * Get logs for a project
   * @param projectId Project ID
   * @param limit Maximum number of logs to return
   */
  getLogs(projectId: string, limit = this.maxLogLines) {
    if (!this.processes.has(projectId)) return []
    const processData = this.processes.get(projectId)!
    const safeLimit = Number.isInteger(limit) && limit >= 0 ? Math.min(limit, this.maxLogLines) : this.maxLogLines
    return safeLimit === 0 ? [] : processData.logs.slice(-safeLimit)
  }

  /**
   * Clear logs for a project
   * @param projectId Project ID
   */
  clearLogs(projectId: string) {
    if (!this.processes.has(projectId)) return
    const processData = this.processes.get(projectId)!
    processData.logs = []
    clear(this.getLogFilePath(projectId))
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

  getProcessResources(pid: number | string) {
    return getProcessResources(pid)
  }

  getProcessTreeResources(rootPids: number[]) {
    return getProcessTreeResources(rootPids)
  }

  /**
   * Get full resource stats including CPU delta calculation
   */
  async getProjectStats(projectId: string) {
    const processData = this.processes.get(projectId)
    if (!processData || !processData.pid) return null

    const pids = processData.commands
      ? [...new Set([...processData.commands.values()].map((command) => command.pid).filter((pid): pid is number => Boolean(pid)))]
      : [processData.pid]
    const resources = await this.getProcessTreeResources(pids)

    if (!resources) {
      console.log('[ProcessManager] No resources found for project', projectId, '(PID:', processData.pid + ')')
      return null
    }

    return {
      pid: processData.pid,
      memory: resources.memory,
      cpu: resources.cpu,
      lastUpdated: Date.now()
    }
  }

  /**
   * Start periodic resource monitoring for all running projects
   * Updates project stats every INTERVAL_MS milliseconds
   */
  startResourceMonitoring(intervalMs = 5000) {
    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval)
    }

    this.resourceMonitorInterval = setInterval(async () => {
      const entries = []
      for (const [projectId, processData] of this.processes.entries()) {
        if (processData.status !== this.STATUS.RUNNING || !processData.pid) {
          continue
        }
        entries.push(this.getProjectStats(projectId)
          .then((stats) => ({ projectId, processData, stats }))
          .catch((error) => {
            log.warn('ProcessManager', `Failed to get stats for ${projectId}:`, error.message)
            return null
          }))
      }

      const statsUpdates: Record<string, unknown> = {}
      for (const result of await Promise.all(entries)) {
        if (!result?.stats) continue
        const { projectId, processData, stats } = result
        statsUpdates[projectId] = stats
        processData.cpu = stats.cpu
        processData.memory = stats.memory
        this.emit('resource-update', { projectId, stats })
      }
      if (Object.keys(statsUpdates).length > 0) {
        this.emit('resources-batch', statsUpdates)
      }
    }, intervalMs)

    log.info('ProcessManager', `Started resource monitoring with ${intervalMs}ms interval`)
  }

  stopResourceMonitoring() {
    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval)
      this.resourceMonitorInterval = null
      log.info('ProcessManager', 'Stopped resource monitoring')
    }
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
