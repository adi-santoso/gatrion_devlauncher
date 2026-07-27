const { spawn, exec } = require('child_process')
const net = require('net')
const path = require('path')
const util = require('util')
const { EventEmitter } = require('events')
const execAsync = util.promisify(exec)

class ProcessManager extends EventEmitter {
  constructor() {
    super()
    this.processes = new Map() // projectId -> process data
    this.nextLogId = 1
    this.STATUS = {
      STOPPED: 'STOPPED',
      STARTING: 'STARTING',
      RUNNING: 'RUNNING',
      STOPPING: 'STOPPING',
      ERROR: 'ERROR',
    }
  }

  /**
   * Start a project process
   * @param {string} projectId - Project ID
   * @param {string} projectPath - Project directory path
   * @param {string} command - Command to execute (e.g., 'npm run dev')
   * @param {object} env - Environment variables
   * @param {function} onLog - Callback for log lines
   * @param {function} onExit - Callback for process exit
   * @param {function} onError - Callback for errors
   * @param {function} onReady - Callback when readiness succeeds
   */
  async startProcess(projectId, projectPath, command, env = {}, port = null, onLog, onExit, onError, onReady) {
    // Validate required parameters
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!projectPath) {
      throw new Error('Project path is required')
    }
    if (!command || !command.trim()) {
      throw new Error('Start command is required')
    }
    if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new Error('Port must be an integer between 1 and 65535')
    }

    // Check if already running or starting
    if (this.processes.has(projectId)) {
      const processData = this.processes.get(projectId)
      if (processData.status === this.STATUS.RUNNING || processData.status === this.STATUS.STARTING) {
        throw new Error(`Project ${projectId} is already running`)
      }
    }

    if (port !== null && await this.isPortOpen(port)) {
      throw new Error(`Port ${port} is already in use`)
    }

    try {
      console.log('[ProcessManager] Starting process:', {
        projectId,
        projectPath,
        command,
        env
      })

      // Set initial status
      this.processes.set(projectId, {
        pid: null,
        status: this.STATUS.STARTING,
        startedAt: Date.now(),
        logs: [],
        command,
        projectPath,
        port,
      })
      this.emit('status-change', { projectId, status: 'starting' })

      // Spawn the process (pass full command string to avoid DEP0190 warning when shell: true)
      const childProcess = spawn(command, {
        cwd: projectPath,
        env: { ...process.env, ...env },
        shell: true, // Use shell to support complex commands
        detached: process.platform !== 'win32',
        windowsHide: false, // Show console window on Windows
      })

      console.log('[ProcessManager] Process spawned with PID:', childProcess.pid)

      // Update with PID
      const processData = this.processes.get(projectId)
      processData.pid = childProcess.pid
      processData.process = childProcess
      if (port === null) {
        processData.status = this.STATUS.RUNNING
        console.log('[ProcessManager] Process status updated to RUNNING')
        this.emit('status-change', { projectId, status: 'running' })
      }

      // Handle stdout
      childProcess.stdout.on('data', (data) => {
        const logLine = data.toString()
        const log = this.addLog(projectId, logLine, 'stdout')
        if (onLog) onLog(projectId, log)
      })

      // Handle stderr
      childProcess.stderr.on('data', (data) => {
        const logLine = data.toString()
        const log = this.addLog(projectId, logLine, 'stderr')
        if (onLog) onLog(projectId, log)
      })

      // Handle process exit
      childProcess.on('exit', (code, signal) => {
        console.log('[ProcessManager] Process exited:', { projectId, code, signal })
        const processData = this.processes.get(projectId)
        if (processData) {
          const previousStatus = processData.status
          const stoppedByUser = previousStatus === this.STATUS.STOPPING
          processData.status = previousStatus === this.STATUS.ERROR
            ? this.STATUS.ERROR
            : stoppedByUser || code === 0 ? this.STATUS.STOPPED : this.STATUS.ERROR
          processData.pid = null
          processData.exitCode = code
          processData.exitSignal = signal
          if (processData.status === this.STATUS.ERROR && previousStatus !== this.STATUS.ERROR) {
            processData.error = signal ? `Exited with signal ${signal}` : `Exited with code ${code}`
          }
          this.emit('status-change', { projectId, status: processData.status.toLowerCase() })
        }
        if (onExit) onExit(projectId, code, signal)
      })

      // Handle errors
      childProcess.on('error', (error) => {
        console.error('[ProcessManager] Process error:', { projectId, error: error.message })
        const processData = this.processes.get(projectId)
        if (processData) {
          processData.status = this.STATUS.ERROR
          processData.error = error.message
          this.addLog(projectId, `Error: ${error.message}`, 'error')
          this.emit('status-change', { projectId, status: 'error' })
        }
        if (onError) onError(projectId, error)
      })

      if (port !== null) {
        this.waitForPort(projectId, port)
          .then((ready) => {
            if (ready && onReady) onReady(projectId)
          })
          .catch((error) => {
            const current = this.processes.get(projectId)
            if (!current || current.status !== this.STATUS.STARTING) return
            current.status = this.STATUS.ERROR
            current.error = error.message
            this.addLog(projectId, error.message, 'error')
            if (onError) onError(projectId, error)
            this.killProcessTree(childProcess, true).catch(() => {})
          })
      }

      return { success: true, pid: childProcess.pid, status: processData.status }
    } catch (error) {
      this.processes.set(projectId, {
        pid: null,
        status: this.STATUS.ERROR,
        error: error.message,
        logs: [],
      })
      throw error
    }
  }

  async isPortOpen(port, timeout = 250) {
    const checkHost = (targetHost) => new Promise((resolve) => {
      const socket = net.createConnection({ port, host: targetHost })
      const finish = (open) => {
        socket.destroy()
        resolve(open)
      }
      socket.setTimeout(timeout)
      socket.once('connect', () => finish(true))
      socket.once('timeout', () => finish(false))
      socket.once('error', () => finish(false))
    })

    if (await checkHost('127.0.0.1')) return true
    if (await checkHost('localhost')) return true
    if (await checkHost('::1')) return true
    return false
  }

  async waitForPort(projectId, port, timeout = 30000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const processData = this.processes.get(projectId)
      if (!processData || processData.status !== this.STATUS.STARTING) {
        return false
      }
      if (await this.isPortOpen(port)) {
        processData.status = this.STATUS.RUNNING
        this.emit('status-change', { projectId, status: 'running' })
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(`Timed out waiting for port ${port}`)
  }

  /**
   * Check if a port is in use and find its owner PID + process name
   * @param {number} port - TCP Port
   */
  async findPortOwner(port) {
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
      let foundPid = null

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
      let managedProjectName = null
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
   * @param {string} projectId - Project ID
   */
  async getProcessMetrics(projectId) {
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

    let memoryMb = null

    try {
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { timeout: 1500 })
      const match = stdout.match(/^"[^"]+","\d+","[^"]+","\d+","([\d\s,.]+)\s*K"/i)
      if (match && match[1]) {
        const memKbStr = match[1].replace(/[,.\s]/g, '')
        const memKb = parseInt(memKbStr, 10)
        if (!isNaN(memKb)) {
          memoryMb = Math.round(memKb / 1024)
        }
      }
    } catch {
      // Ignore
    }

    // Assign uptime string back to processData so headers retain it
    processData.uptime = uptimeStr

    return {
      status: (processData.status || 'stopped').toLowerCase(),
      pid,
      uptime: uptimeStr,
      uptimeSec,
      memoryMb,
      cpuPercent: null
    }
  }

  /**
   * Stop a project process
   * @param {string} projectId - Project ID
   * @param {boolean} force - Force kill (SIGKILL) instead of graceful (SIGTERM)
   */
  async stopProcess(projectId, force = false) {
    if (!this.processes.has(projectId)) {
      throw new Error(`Project ${projectId} is not running`)
    }

    const processData = this.processes.get(projectId)
    if (processData.status !== this.STATUS.RUNNING && processData.status !== this.STATUS.STARTING) {
      throw new Error(`Project ${projectId} is not running (status: ${processData.status})`)
    }

    processData.status = this.STATUS.STOPPING

    try {
      const { process: childProcess } = processData

      return await new Promise((resolve, reject) => {
        let settled = false
        const finish = (result, error) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          if (error) reject(error)
          else resolve(result)
        }

        const timeout = setTimeout(() => {
          this.killProcessTree(childProcess, true)
            .then(() => {
              this.addLog(projectId, 'Force killed after timeout', 'system')
              finish({ success: true, forced: true })
            })
            .catch((error) => finish(null, error))
        }, force ? 1000 : 5000)

        childProcess.once('exit', () => {
          processData.status = this.STATUS.STOPPED
          processData.pid = null
          finish({ success: true, forced: force })
        })

        this.killProcessTree(childProcess, force)
          .then(() => {
            this.addLog(
              projectId,
              force ? 'Process force killed' : 'Shutting down gracefully',
              'system'
            )
          })
          .catch((error) => {
            if (force) finish(null, error)
            else this.addLog(projectId, `Graceful shutdown failed: ${error.message}`, 'system')
          })
      })
    } catch (error) {
      processData.status = this.STATUS.ERROR
      processData.error = error.message
      throw error
    }
  }

  killProcessTree(childProcess, force) {
    if (!childProcess?.pid) {
      return Promise.reject(new Error('Process PID is unavailable'))
    }

    if (process.platform !== 'win32') {
      try {
        process.kill(-childProcess.pid, force ? 'SIGKILL' : 'SIGTERM')
        return Promise.resolve()
      } catch (error) {
        return Promise.reject(error)
      }
    }

    return new Promise((resolve, reject) => {
      const args = ['/pid', String(childProcess.pid), '/T']
      if (force) args.push('/F')

      const killer = spawn('taskkill', args, { windowsHide: true })
      let stderr = ''
      killer.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      killer.once('error', reject)
      killer.once('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || `taskkill exited with code ${code}`))
      })
    })
  }

  /**
   * Get process status
   * @param {string} projectId - Project ID
   */
  getProcessStatus(projectId) {
    if (!this.processes.has(projectId)) {
      return { status: this.STATUS.STOPPED, logs: [] }
    }
    const processData = this.processes.get(projectId)
    return {
      status: processData.status,
      pid: processData.pid,
      startedAt: processData.startedAt,
      logs: processData.logs,
      exitCode: processData.exitCode,
      error: processData.error,
      port: processData.port,
    }
  }

  getStatus(projectId) {
    return this.getProcessStatus(projectId)
  }

  /**
   * Add log line to buffer
   * @param {string} projectId - Project ID
   * @param {string} logLine - Log line
   * @param {string} type - Log type (stdout, stderr, error, system)
   */
  addLog(projectId, logLine, type = 'stdout') {
    if (!this.processes.has(projectId)) return

    const processData = this.processes.get(projectId)
    const timestamp = new Date().toISOString()
    const cleanLine = typeof logLine === 'string'
      ? logLine.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
      : logLine

    const log = {
      id: this.nextLogId++,
      timestamp,
      type,
      message: cleanLine,
    }
    processData.logs.push(log)

    // Keep only last 1000 log lines
    if (processData.logs.length > 1000) {
      processData.logs.shift()
    }

    return log
  }

  /**
   * Get logs for a project
   * @param {string} projectId - Project ID
   * @param {number} limit - Maximum number of logs to return
   */
  getLogs(projectId, limit = 1000) {
    if (!this.processes.has(projectId)) return []
    const processData = this.processes.get(projectId)
    const safeLimit = Number.isInteger(limit) && limit >= 0 ? Math.min(limit, 1000) : 1000
    return safeLimit === 0 ? [] : processData.logs.slice(-safeLimit)
  }

  /**
   * Clear logs for a project
   * @param {string} projectId - Project ID
   */
  clearLogs(projectId) {
    if (!this.processes.has(projectId)) return
    const processData = this.processes.get(projectId)
    processData.logs = []
  }

  /**
   * Get all running processes
   */
  getAllProcesses() {
    const result = {}
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
   * @param {string} projectId - Project ID
   * @param {string} projectPath - Project directory path
   * @param {string} command - Command to execute
   * @param {object} env - Environment variables
   * @param {function} onLog - Callback for log lines
   * @param {function} onExit - Callback for process exit
   * @param {function} onError - Callback for errors
   */
  async restartProcess(
    projectId,
    projectPath,
    command,
    env = {},
    port = null,
    onLog,
    onExit,
    onError,
    onReady
  ) {
    try {
      // Stop if running
      if (this.processes.has(projectId)) {
        const processData = this.processes.get(projectId)
        if (processData.status === this.STATUS.RUNNING || processData.status === this.STATUS.STARTING) {
          await this.stopProcess(projectId, false)
          // Wait a bit for cleanup
          await new Promise((resolve) => setTimeout(resolve, 1000))
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
    const promises = []
    this.processes.forEach((processData, projectId) => {
      if (processData.status === this.STATUS.RUNNING || processData.status === this.STATUS.STARTING) {
        promises.push(this.stopProcess(projectId, false))
      }
    })
    return Promise.all(promises)
  }
}

module.exports = ProcessManager
