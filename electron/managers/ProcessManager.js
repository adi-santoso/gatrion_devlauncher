const { spawn, exec } = require('child_process')
const net = require('net')
const os = require('os')
const path = require('path')
const util = require('util')
const { EventEmitter } = require('events')
const execAsync = util.promisify(exec)
const Logger = require('../utils/logger')
const log = Logger || { info: () => {}, warn: () => {}, error: () => {} }

// Memory limit constants (in MB)
const MEMORY_WARNING_THRESHOLD = 1600 // 1.6 GB
const MEMORY_CRITICAL_THRESHOLD = 3072 // 3 GB
const CPU_WARNING_THRESHOLD = 80 // percentage

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
    const commands = Array.isArray(command)
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
      const processData = this.processes.get(projectId)
      if ([this.STATUS.RUNNING, this.STATUS.STARTING, this.STATUS.STOPPING].includes(processData.status)) {
        throw new Error(`Project ${projectId} is already active`)
      }
    }

    for (const item of commands) if (item.port !== null && item.port !== undefined && await this.isPortOpen(item.port)) throw new Error(`Port ${item.port} is already in use`)

    try {
      log.info('ProcessManager', 'Starting process', { projectId, projectPath, commands })

      const processData = {
        pid: null,
        status: this.STATUS.STARTING,
        startedAt: Date.now(),
        logs: [],
        command: commands.find((item) => item.primary)?.command || commands[0].command,
        projectPath,
        port: commands.find((item) => item.primary)?.port ?? null,
        runId: Symbol(projectId),
        commands: new Map(),
        onExit,
        onError,
        onReady,
      }
      this.processes.set(projectId, processData)
      this.emit('status-change', { projectId, status: 'starting' })

      const spawnCommand = (descriptor) => new Promise((resolve, reject) => {
        const childProcess = spawn(descriptor.command, { cwd: projectPath, env: { ...process.env, ...env }, shell: true, detached: process.platform !== 'win32', windowsHide: false })
        const child = { ...descriptor, status: this.STATUS.STARTING, process: childProcess, pid: childProcess.pid, ready: descriptor.port === null || descriptor.port === undefined }
        processData.commands.set(descriptor.id, child)
        if (descriptor.primary) { processData.pid = child.pid; processData.process = childProcess }
        const handleOutput = (data, type) => {
          const entry = this.addLog(projectId, data.toString(), type, descriptor.id, descriptor.name)
          if (onLog) onLog(projectId, entry)
        }
        childProcess.stdout?.on('data', (data) => handleOutput(data, 'stdout'))
        childProcess.stderr?.on('data', (data) => handleOutput(data, 'stderr'))
        childProcess.once('error', (error) => {
          this.failComposite(projectId, processData.runId, child, error, onError)
          reject(error)
        })
        childProcess.once('exit', (code, signal) => this.handleChildExit(projectId, processData.runId, child, code, signal, onExit, onError))
        childProcess.once('spawn', () => resolve(child))
      })

      await Promise.all(commands.map(spawnCommand))
      this.waitForCompositeReady(projectId, processData.runId)
      return { success: true, pid: processData.pid, status: processData.status, commands: this.getCommandSnapshot(processData) }
    } catch (error) {
      const current = this.processes.get(projectId)
      if (current?.runId) {
        this.failComposite(projectId, current.runId, null, error, onError)
      } else {
        this.processes.set(projectId, { pid: null, status: this.STATUS.ERROR, error: error.message, logs: [] })
      }
      throw error
    }
  }

  getCommandSnapshot(processData) {
    return [...(processData?.commands?.values() || [])].map((item) => ({ id: item.id, name: item.name, command: item.command, port: item.port ?? null, primary: item.primary, status: item.status, pid: item.pid, ready: item.ready }))
  }

  async waitForCompositeReady(projectId, runId) {
    const data = this.processes.get(projectId)
    if (!data || data.runId !== runId) return
    try {
      await Promise.all([...data.commands.values()].filter((item) => item.port !== null && item.port !== undefined).map(async (item) => {
        const ready = await this.waitForPort(projectId, item.port, 30000, runId, item.id)
        if (!ready) return
        item.ready = true
        item.status = this.STATUS.RUNNING
      }))
      const current = this.processes.get(projectId)
      if (!current || current.runId !== runId || current.status !== this.STATUS.STARTING) return
      current.status = this.STATUS.RUNNING
      for (const item of current.commands.values()) if (item.status === this.STATUS.STARTING) item.status = this.STATUS.RUNNING
      this.emit('status-change', { projectId, status: 'running' })
      if (current.onReady) current.onReady(projectId)
    } catch (error) {
      this.failComposite(projectId, runId, null, error, data.onError)
    }
  }

  handleChildExit(projectId, runId, child, code, signal, onExit, onError) {
    const data = this.processes.get(projectId)
    if (!data || data.runId !== runId) return
    child.pid = null
    child.exitCode = code
    child.exitSignal = signal
    if (child.primary) {
      data.exitCode = code
      data.exitSignal = signal
      data.pid = null
    }
    const intentional = data.status === this.STATUS.STOPPING
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

  failComposite(projectId, runId, failedChild, error, onError) {
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

  async waitForPort(projectId, port, timeout = 30000, runId = null, commandId = null) {
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
   * @param {string} projectId - Project ID
   * @param {boolean} force - Force kill (SIGKILL) instead of graceful (SIGTERM)
   */
  async stopProcess(projectId, force = false) {
    if (!this.processes.has(projectId)) {
      throw new Error(`Project ${projectId} is not running`)
    }

    const processData = this.processes.get(projectId)
    if (![this.STATUS.RUNNING, this.STATUS.STARTING, this.STATUS.ERROR].includes(processData.status)) {
      throw new Error(`Project ${projectId} is not running (status: ${processData.status})`)
    }

    processData.status = this.STATUS.STOPPING

    try {
      this.emit('status-change', { projectId, status: 'stopping' })
      const children = processData.commands
        ? [...processData.commands.values()].filter((item) => item.process && item.pid)
        : [{ id: 'main', name: 'Application', process: processData.process, pid: processData.pid }].filter((item) => item.process && item.pid)
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
          this.addLog(projectId, `Graceful shutdown failed: ${error.message}`, 'system', child.id, child.name)
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
      commands: this.getCommandSnapshot(processData),
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
  addLog(projectId, logLine, type = 'stdout', commandId = null, commandName = null) {
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
      commandId,
      commandName,
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
   * Get CPU & Memory usage for a specific PID using Windows tasklist
   * Returns { cpu: number (percentage), memory: number (MB) } or null if not found
   */
  async getProcessResources(pid) {
    const numericPid = Number(pid)
    if (!Number.isInteger(numericPid) || numericPid <= 0) return null
    
    try {
      // Use tasklist /FO CSV /FI "PID eq <pid>" on Windows PowerShell
      const { stdout } = await execAsync(`tasklist /FO CSV /NH /FI "PID eq ${pid}"`, { 
        timeout: 3000 
      })
      
      // Standard tasklist CSV: image name, PID, session name, session number, memory usage.
      const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.includes('INFO'))
      if (lines.length === 0) return null
      
      // Remove quotes and split by comma carefully (memory value might contain commas)
      const firstLine = lines[0]
      const parts = []
      let current = ''
      let inQuotes = false
      
      for (let i = 0; i < firstLine.length; i++) {
        const char = firstLine[i]
        if (char === '"') {
          inQuotes = !inQuotes
          continue
        }
        if (char === ',' && !inQuotes) {
          parts.push(current)
          current = ''
        } else {
          current += char
        }
      }
      parts.push(current)
      
      if (parts.length < 5) {
        console.warn('[ProcessManager] Not enough columns in tasklist output:', parts)
        return null
      }
      
      const [image, pidStr, , , memoryStr] = parts
      const numericMemory = memoryStr.replace(/[^0-9]/g, '')
      
      if (!pidStr || !numericMemory || !Number(numericMemory)) {
        console.warn('[ProcessManager] Invalid memory value:', memoryStr)
        return null
      }
      
      const memoryKB = parseInt(numericMemory, 10)
      const memoryMB = memoryKB / 1024
      
      let cpuPercent = 0
      try {
        const { stdout: firstSample } = await execAsync(
          `powershell.exe -NoProfile -Command "$p=Get-Process -Id ${numericPid} -ErrorAction Stop; Write-Output ($p.CPU.ToString([Globalization.CultureInfo]::InvariantCulture))"`,
          { timeout: 3000 }
        )
        const firstCpu = Number.parseFloat(firstSample.trim())
        const firstTime = Date.now()
        await new Promise((resolve) => setTimeout(resolve, 250))
        const { stdout: secondSample } = await execAsync(
          `powershell.exe -NoProfile -Command "$p=Get-Process -Id ${numericPid} -ErrorAction Stop; Write-Output ($p.CPU.ToString([Globalization.CultureInfo]::InvariantCulture))"`,
          { timeout: 3000 }
        )
        const secondCpu = Number.parseFloat(secondSample.trim())
        const elapsedSeconds = (Date.now() - firstTime) / 1000
        if (Number.isFinite(firstCpu) && Number.isFinite(secondCpu) && elapsedSeconds > 0) {
          cpuPercent = Math.min(100, Math.max(0, ((secondCpu - firstCpu) / elapsedSeconds) * 100 / Math.max(1, os.cpus().length)))
        }
      } catch {
        // The process can exit between samples; memory data remains useful.
      }
      
      return {
        pid: parseInt(pidStr, 10),
        memory: memoryMB, // in MB
        cpu: cpuPercent
      }
    } catch (err) {
      console.warn('[ProcessManager] Failed to get resources for PID', pid, ':', err.message)
      return null
    }
  }


  /**
   * Calculate CPU usage by comparing two samples
   */
  async calculateCpuUsage(pid, prevTime = null) {
    if (!pid) return 0
    
    try {
      // On Windows, use perfmon counter or WMIC
      // Simpler approach: use wmic process where...
      const { stdout } = await execAsync(
        `wmic path win32_process where "ProcessId=${pid}" get CPU,WorkingSetSize /FORMAT:CSV`,
        { timeout: 3000 }
      )
      
      const lines = stdout.trim().split('\n')
      if (lines.length < 2) return 0
      
      // Parse: CPU,WorkingSetSize
      const [cpuLine, memLine] = lines
      const [, cpuValue] = cpuLine.split(',')
      
      const currentCpu = parseFloat(cpuValue) || 0
      const timestamp = Date.now()
      
      return currentCpu
    } catch (err) {
      return 0
    }
  }

  /**
   * Get full resource stats including CPU delta calculation
   */
  async getProjectStats(projectId) {
    const processData = this.processes.get(projectId)
    if (!processData || !processData.pid) return null

    const pids = processData.commands
      ? [...new Set([...processData.commands.values()].map((command) => command.pid).filter(Boolean))]
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

  async getProcessTreeResources(rootPids) {
    const roots = [...new Set(rootPids.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0))]
    if (roots.length === 0) return null
    if (process.platform !== 'win32') {
      const samples = (await Promise.all(roots.map((pid) => this.getProcessResources(pid)))).filter(Boolean)
      if (samples.length === 0) return null
      return {
        memory: samples.reduce((total, sample) => total + sample.memory, 0),
        cpu: Math.min(100, samples.reduce((total, sample) => total + sample.cpu, 0)),
      }
    }

    const script = [
      `$roots=@(${roots.join(',')})`,
      '$rows=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId',
      "$ids=New-Object 'System.Collections.Generic.HashSet[int]'",
      '$roots | ForEach-Object { [void]$ids.Add([int]$_) }',
      'do { $added=$false; foreach($row in $rows) { if($ids.Contains([int]$row.ParentProcessId) -and $ids.Add([int]$row.ProcessId)) { $added=$true } } } while($added)',
      '$first=@{}; Get-Process -Id @($ids) -ErrorAction SilentlyContinue | ForEach-Object { $first[$_.Id]=$_.CPU }',
      '$started=[DateTime]::UtcNow; Start-Sleep -Milliseconds 250',
      '$elapsed=([DateTime]::UtcNow-$started).TotalSeconds; $memory=0.0; $cpu=0.0',
      'Get-Process -Id @($ids) -ErrorAction SilentlyContinue | ForEach-Object { $memory+=$_.WorkingSet64; if($first.ContainsKey($_.Id) -and $null -ne $_.CPU) { $cpu+=($_.CPU-$first[$_.Id]) } }',
      `[PSCustomObject]@{memory=($memory/1MB);cpu=[Math]::Min(100,[Math]::Max(0,($cpu/$elapsed)*100/${Math.max(1, os.cpus().length)}))} | ConvertTo-Json -Compress`,
    ].join('; ')

    try {
      const { stdout } = await execAsync(`powershell.exe -NoProfile -Command "${script}"`, { timeout: 5000 })
      const resources = JSON.parse(stdout.trim())
      if (!Number.isFinite(resources.memory) || !Number.isFinite(resources.cpu)) return null
      return resources
    } catch (error) {
      log.warn('ProcessManager', 'Failed to sample process tree:', error.message)
      return null
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

      const statsUpdates = {}
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
        if ([this.STATUS.RUNNING, this.STATUS.STARTING, this.STATUS.ERROR].includes(processData.status)) {
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
    const promises = []
    this.processes.forEach((processData, projectId) => {
      if ([this.STATUS.RUNNING, this.STATUS.STARTING, this.STATUS.ERROR].includes(processData.status)) {
        promises.push(this.stopProcess(projectId, false))
      }
    })
    return Promise.all(promises)
  }
}

module.exports = ProcessManager
