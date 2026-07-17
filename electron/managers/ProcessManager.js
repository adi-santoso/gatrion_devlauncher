const { spawn } = require('child_process')
const path = require('path')

class ProcessManager {
  constructor() {
    this.processes = new Map() // projectId -> process data
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
   */
  startProcess(projectId, projectPath, command, env = {}, onLog, onExit, onError) {
    // Check if already running
    if (this.processes.has(projectId)) {
      const processData = this.processes.get(projectId)
      if (processData.status === this.STATUS.RUNNING) {
        throw new Error(`Project ${projectId} is already running`)
      }
    }

    try {
      // Parse command (e.g., 'npm run dev' -> ['npm', 'run', 'dev'])
      const parts = command.split(' ')
      const cmd = parts[0]
      const args = parts.slice(1)

      // Set initial status
      this.processes.set(projectId, {
        pid: null,
        status: this.STATUS.STARTING,
        startedAt: Date.now(),
        logs: [],
        command,
        projectPath,
      })

      // Spawn the process
      const childProcess = spawn(cmd, args, {
        cwd: projectPath,
        env: { ...process.env, ...env },
        shell: true, // Use shell to support complex commands
        windowsHide: false, // Show console window on Windows
      })

      // Update with PID
      const processData = this.processes.get(projectId)
      processData.pid = childProcess.pid
      processData.process = childProcess
      processData.status = this.STATUS.RUNNING

      // Handle stdout
      childProcess.stdout.on('data', (data) => {
        const logLine = data.toString()
        this.addLog(projectId, logLine, 'stdout')
        if (onLog) onLog(projectId, logLine, 'stdout')
      })

      // Handle stderr
      childProcess.stderr.on('data', (data) => {
        const logLine = data.toString()
        this.addLog(projectId, logLine, 'stderr')
        if (onLog) onLog(projectId, logLine, 'stderr')
      })

      // Handle process exit
      childProcess.on('exit', (code, signal) => {
        const processData = this.processes.get(projectId)
        if (processData) {
          processData.status = this.STATUS.STOPPED
          processData.exitCode = code
          processData.exitSignal = signal
        }
        if (onExit) onExit(projectId, code, signal)
      })

      // Handle errors
      childProcess.on('error', (error) => {
        const processData = this.processes.get(projectId)
        if (processData) {
          processData.status = this.STATUS.ERROR
          processData.error = error.message
          this.addLog(projectId, `Error: ${error.message}`, 'error')
        }
        if (onError) onError(projectId, error)
      })

      return { success: true, pid: childProcess.pid }
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
    if (processData.status !== this.STATUS.RUNNING) {
      throw new Error(`Project ${projectId} is not running (status: ${processData.status})`)
    }

    processData.status = this.STATUS.STOPPING

    try {
      const { process: childProcess, pid } = processData

      if (force) {
        // Force kill
        childProcess.kill('SIGKILL')
        this.addLog(projectId, 'Process force killed (SIGKILL)', 'system')
      } else {
        // Graceful shutdown
        childProcess.kill('SIGTERM')
        this.addLog(projectId, 'Shutting down gracefully (SIGTERM)', 'system')
      }

      // Wait for process to exit (with timeout)
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          // If not exited after timeout, force kill
          if (processData.status === this.STATUS.STOPPING) {
            childProcess.kill('SIGKILL')
            this.addLog(projectId, 'Force killed after timeout', 'system')
          }
          resolve({ success: true, forced: true })
        }, 5000) // 5 second timeout

        childProcess.once('exit', () => {
          clearTimeout(timeout)
          processData.status = this.STATUS.STOPPED
          resolve({ success: true, forced: false })
        })
      })
    } catch (error) {
      processData.status = this.STATUS.ERROR
      processData.error = error.message
      throw error
    }
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
    }
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

    processData.logs.push({
      timestamp,
      type,
      message: logLine,
    })

    // Keep only last 1000 log lines
    if (processData.logs.length > 1000) {
      processData.logs.shift()
    }
  }

  /**
   * Get logs for a project
   * @param {string} projectId - Project ID
   * @param {number} limit - Maximum number of logs to return
   */
  getLogs(projectId, limit = 1000) {
    if (!this.processes.has(projectId)) return []
    const processData = this.processes.get(projectId)
    return processData.logs.slice(-limit)
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
   * Stop all running processes
   */
  async stopAllProcesses() {
    const promises = []
    this.processes.forEach((processData, projectId) => {
      if (processData.status === this.STATUS.RUNNING) {
        promises.push(this.stopProcess(projectId, false))
      }
    })
    return Promise.all(promises)
  }
}

module.exports = ProcessManager
