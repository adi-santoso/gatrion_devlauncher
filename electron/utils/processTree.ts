import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import { cpus } from 'os'

const execAsync = promisify(exec)

interface ProcessResources {
  pid: number
  memory: number
  cpu: number
}

type SingleSample = (pid: number | string) => Promise<ProcessResources | null>

/**
 * CPU percentages are derived by diffing two cumulative CPU-second snapshots
 * taken across consecutive monitoring ticks (seconds apart), not a 250ms
 * inline micro-sample. A 250ms window reads ~0 for an idle framework server,
 * which is why CPU always surfaced as 0%. Each key (a pid, or a sorted
 * process-tree pid list) remembers its previous snapshot so `computeCpuPercent`
 * has a real elapsed interval to measure against.
 */
const cpuSampleCache = new Map<string, { cpuSec: number; at: number }>()

function computeCpuPercent(key: string, cpuSec: number): number {
  const prev = cpuSampleCache.get(key)
  const now = Date.now()
  cpuSampleCache.set(key, { cpuSec, at: now })
  if (!prev) return 0
  const elapsedSec = (now - prev.at) / 1000
  if (elapsedSec <= 0 || cpuSec < prev.cpuSec) return 0
  return Math.min(100, Math.max(0, ((cpuSec - prev.cpuSec) / elapsedSec) * 100 / Math.max(1, cpus().length)))
}

/**
 * Kill a process tree. On Windows this uses taskkill /T (tree kill), on
 * POSIX it signals the process group (children are spawned detached, so the
 * group id equals the child pid).
 *
 * Graceful mode (force = false) mirrors SIGTERM:
 *   - Windows: close the tree's top-level windows with `taskkill /T` (no /F),
 *     then wait briefly for it to exit and escalate to /F only if it is still
 *     alive. Hard-killing a dev server / database on quit risks corrupting
 *     state, so running projects get a real chance to shut down first.
 *   - POSIX: SIGTERM, then SIGKILL after a grace period (see killPosixTree).
 */
async function killProcessTree(
  childProcess: import('child_process').ChildProcess,
  force: boolean,
  platform: NodeJS.Platform = process.platform
): Promise<void> {
  if (!childProcess?.pid) {
    throw new Error('Process PID is unavailable')
  }

  if (platform !== 'win32') {
    await killPosixTree(childProcess.pid, force)
    return
  }

  await killWindowsTree(childProcess.pid, force)
}

/** True when a PID is still in the process table. */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Run taskkill against a PID (+ whole tree). Resolves false on failure. */
function runTaskkill(pid: number, force: boolean): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const args = ['/pid', String(pid), '/T']
    if (force) args.push('/F')
    const killer = spawn('taskkill', args, { windowsHide: true })
    // Drain stderr so the pipe never fills; we only care about the exit code.
    killer.stderr.on('data', () => {})
    killer.once('error', () => resolve(false))
    killer.once('exit', (code: number | null) => {
      resolve(code === 0)
    })
  })
}

/**
 * Windows tree kill. Graceful = taskkill /T (no /F): posts a close to the
 * tree's top-level windows, giving console/GUI apps a chance to clean up.
 * Then wait up to ~2.2s for the root PID to exit and escalate to /F if it
 * is still alive â€” the same grace-then-force escalation POSIX already had.
 */
async function killWindowsTree(pid: number, force: boolean): Promise<void> {
  if (!force) {
    // Graceful attempt first: close the tree's windows, then watch for exit.
    await runTaskkill(pid, false)
    if (!isPidAlive(pid)) return
    const deadline = Date.now() + 2200
    while (Date.now() < deadline) {
      if (!isPidAlive(pid)) return
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  // Escalate: if the tree (or its root) is still alive, force-kill it.
  if (isPidAlive(pid)) {
    await runTaskkill(pid, true)
  }
}

/**
 * POSIX: signal the process group. A group that is already gone (ESRCH)
 * counts as success â€” the process simply died first. Graceful stops wait a
 * short grace period and escalate to SIGKILL if the group is still alive.
 */
async function killPosixTree(pid: number, force: boolean): Promise<void> {
  const signal: NodeJS.Signals = force ? 'SIGKILL' : 'SIGTERM'
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return // already gone â€” success
    try {
      process.kill(pid, signal)
    } catch {
      // also gone â€” success
    }
  }
  if (force) return

  // Graceful: wait briefly for the group to exit, then escalate to SIGKILL.
  const deadline = Date.now() + 1500
  while (Date.now() < deadline) {
    try {
      process.kill(-pid, 0)
    } catch {
      return // group gone â€” done
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // already gone
  }
}

/**
 * Get CPU & Memory usage for a specific PID using Windows tasklist.
 * Returns { cpu: number (percentage), memory: number (MB) } or null if not found.
 */
async function getProcessResources(pid: number | string): Promise<ProcessResources | null> {
  const numericPid = Number(pid)
  if (!Number.isInteger(numericPid) || numericPid <= 0) return null

  try {
    // Use tasklist /FO CSV /FI "PID eq <pid>" on Windows PowerShell
    const { stdout } = await execAsync(`tasklist /FO CSV /NH /FI "PID eq ${pid}"`, {
      timeout: 3000,
    })

    // Standard tasklist CSV: image name, PID, session name, session number, memory usage.
    const lines = stdout.trim().split('\n').filter((l: string) => l.trim() && !l.includes('INFO'))
    if (lines.length === 0) return null

    // Remove quotes and split by comma carefully (memory value might contain commas)
    const firstLine = lines[0]
    const parts: string[] = []
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
      const { stdout: sample } = await execAsync(
        `powershell.exe -NoProfile -Command "$p=Get-Process -Id ${numericPid} -ErrorAction Stop; Write-Output ($p.CPU.ToString([Globalization.CultureInfo]::InvariantCulture))"`,
        { timeout: 2000 }
      )
      const cpuSeconds = Number.parseFloat(sample.trim())
      if (Number.isFinite(cpuSeconds) && cpuSeconds >= 0) {
        cpuPercent = computeCpuPercent(`pid:${numericPid}`, cpuSeconds)
      }
    } catch {
      // The process can exit between memory and CPU sampling; memory remains useful.
    }

    return {
      pid: parseInt(pidStr, 10),
      memory: memoryMB, // in MB
      cpu: cpuPercent,
    }
  } catch (err) {
    console.warn('[ProcessManager] Failed to get resources for PID', pid, ':', (err as Error).message)
    return null
  }
}

/**
 * Sample CPU + memory for a set of root PIDs including their descendants.
 * Uses a PowerShell CIM walk on Windows; on POSIX it sums per-PID samples.
 */
async function getProcessTreeResources(
  rootPids: number[],
  singleSample: SingleSample = getProcessResources
): Promise<{ memory: number; cpu: number } | null> {
  const roots = [...new Set(rootPids.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0))]
  if (roots.length === 0) return null
  if (process.platform !== 'win32') {
    const samples = (await Promise.all(roots.map((pid) => singleSample(pid)))).filter((s): s is ProcessResources => Boolean(s))
    if (samples.length === 0) return null
    return {
      memory: samples.reduce((total, sample) => total + sample.memory, 0),
      cpu: Math.min(100, samples.reduce((total, sample) => total + sample.cpu, 0)),
    }
  }

  const key = `tree:${roots.sort((a, b) => a - b).join(',')}`
  const script = [
    `$roots=@(${roots.join(',')})`,
    '$rows=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId',
    "$ids=New-Object 'System.Collections.Generic.HashSet[int]'",
    '$roots | ForEach-Object { [void]$ids.Add([int]$_) }',
    'do { $added=$false; foreach($row in $rows) { if($ids.Contains([int]$row.ParentProcessId) -and $ids.Add([int]$row.ProcessId)) { $added=$true } } } while($added)',
    '$cpu=0.0; $memory=0.0',
    'Get-Process -Id @($ids) -ErrorAction SilentlyContinue | ForEach-Object { $memory+=$_.WorkingSet64; if($null -ne $_.CPU) { $cpu += $_.CPU } }',
    '[PSCustomObject]@{memory=($memory/1MB);cpu=$cpu} | ConvertTo-Json -Compress',
  ].join('; ')

  try {
    const { stdout } = await execAsync(`powershell.exe -NoProfile -Command "${script}"`, { timeout: 5000 })
    const resources = JSON.parse(stdout.trim())
    if (!Number.isFinite(resources.memory) || !Number.isFinite(resources.cpu)) return null
    return { memory: resources.memory, cpu: computeCpuPercent(key, resources.cpu) }
  } catch (error) {
    console.warn('[ProcessManager] Failed to sample process tree:', (error as Error).message)
    return null
  }
}

export { killProcessTree, getProcessResources, getProcessTreeResources, computeCpuPercent }

