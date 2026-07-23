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

    // Check if already running or starting
    if (this.processes.has(projectId)) {
      const processData = this.processes.get(projectId)
      if (processData.status === this.STATUS.RUNNING || processData.status === this.STATUS.STARTING) {
        throw new Error(`Project ${projectId} is already running`)
      }
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
      })

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
      processData.status = this.STATUS.RUNNING

      console.log('[ProcessManager] Process status updated to RUNNING')

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
        console.log('[ProcessManager] Process exited:', { projectId, code, signal })
        const processData = this.processes.get(projectId)
        if (processData) {
          const stoppedByUser = processData.status === this.STATUS.STOPPING
          processData.status = stoppedByUser || code === 0
            ? this.STATUS.STOPPED
            : this.STATUS.ERROR
          processData.pid = null
          processData.exitCode = code
          processData.exitSignal = signal
          if (processData.status === this.STATUS.ERROR) {
            processData.error = signal ? `Exited with signal ${signal}` : `Exited with code ${code}`
          }
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
    const cleanLine = typeof logLine === 'string'
      ? logLine.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
      : logLine

    processData.logs.push({
      timestamp,
      type,
      message: cleanLine,
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
    onLog,
    onExit,
    onError
  ) {
    try {
      // Stop if running
      if (this.processes.has(projectId)) {
        const processData = this.processes.get(projectId)
        if (processData.status === this.STATUS.RUNNING) {
          await this.stopProcess(projectId, false)
          // Wait a bit for cleanup
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      // Start again
      return this.startProcess(
        projectId,
        projectPath,
        command,
        env,
        onLog,
        onExit,
        onError
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
      if (processData.status === this.STATUS.RUNNING) {
        promises.push(this.stopProcess(projectId, false))
      }
    })
    return Promise.all(promises)
  }
}

module.exports = ProcessManager
