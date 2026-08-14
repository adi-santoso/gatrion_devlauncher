// @ts-check
const { spawn, exec } = require('child_process')
const os = require('os')
const util = require('util')
const execAsync = util.promisify(exec)

/**
 * Kill a process tree. On Windows this uses taskkill /T (tree kill), on
 * POSIX it signals the process group.
 * @param {import('child_process').ChildProcess} childProcess
 * @param {boolean} force
 * @returns {Promise<void>}
 */
function killProcessTree(childProcess, force) {
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
 * Get CPU & Memory usage for a specific PID using Windows tasklist.
 * Returns { cpu: number (percentage), memory: number (MB) } or null if not found.
 * @param {number|string} pid
 */
async function getProcessResources(pid) {
  const numericPid = Number(pid)
  if (!Number.isInteger(numericPid) || numericPid <= 0) return null

  try {
    // Use tasklist /FO CSV /FI "PID eq <pid>" on Windows PowerShell
    const { stdout } = await execAsync(`tasklist /FO CSV /NH /FI "PID eq ${pid}"`, {
      timeout: 3000,
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

    const [, pidStr, , , memoryStr] = parts
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
      cpu: cpuPercent,
    }
  } catch (err) {
    console.warn('[ProcessManager] Failed to get resources for PID', pid, ':', err.message)
    return null
  }
}

/**
 * Sample CPU + memory for a set of root PIDs including their descendants.
 * Uses a PowerShell CIM walk on Windows; on POSIX it sums per-PID samples.
 * @param {number[]} rootPids
 * @param {(pid: number|string) => Promise<{memory: number, cpu: number}|null>} [singleSample]
 */
async function getProcessTreeResources(rootPids, singleSample = getProcessResources) {
  const roots = [...new Set(rootPids.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0))]
  if (roots.length === 0) return null
  if (process.platform !== 'win32') {
    const samples = (await Promise.all(roots.map((pid) => singleSample(pid)))).filter(Boolean)
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
    console.warn('[ProcessManager] Failed to sample process tree:', error.message)
    return null
  }
}

module.exports = { killProcessTree, getProcessResources, getProcessTreeResources }
