const path = require('path')
const fs = require('fs').promises

interface CrashEntry {
  timestamp: string
  code: number | null
  message: string
}

interface RunEntry {
  start: number
  end: number | null
  uptimeMs: number | null
  code?: number | null
}

interface ResourceSample {
  ts: number
  cpu: number
  memory: number
}

interface ProjectHealth {
  crashes: CrashEntry[]
  runs: RunEntry[]
  samples: ResourceSample[]
}

interface HealthData {
  projects: Record<string, ProjectHealth>
}

/**
 * HealthManager — persists per-project analytics: crash history, run sessions
 * (with uptime), and resource samples rolled up per day. All writes are
 * batched in memory and flushed periodically + on app quit so hot-path
 * resource events never touch the disk.
 */
class HealthManager {
  filePath: string
  data: HealthData
  flushTimer: ReturnType<typeof setInterval> | null
  maxSamplesPerProject = 20000

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, 'health.json')
    this.data = { projects: {} } // projectId -> { crashes: [], runs: [], samples: [] }
    this.flushTimer = null
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw)
      this.data = parsed && typeof parsed === 'object' && parsed.projects ? parsed : { projects: {} }
    } catch {
      this.data = { projects: {} }
    }
    this.flushTimer = setInterval(() => this.flush().catch(() => {}), 30000)
  }

  project(id: string): ProjectHealth {
    if (!this.data.projects[id]) {
      this.data.projects[id] = { crashes: [], runs: [], samples: [] }
    }
    return this.data.projects[id]
  }

  recordCrash(projectId: string, { code = null, message = null }: { code?: number | null; message?: string | null } = {}): void {
    const entry: CrashEntry = { timestamp: new Date().toISOString(), code, message: (message || '').slice(0, 300) }
    this.project(projectId).crashes.push(entry)
    // Keep the most recent 100 crashes per project.
    if (this.project(projectId).crashes.length > 100) {
      this.project(projectId).crashes = this.project(projectId).crashes.slice(-100)
    }
  }

  recordRunStart(projectId: string): void {
    this.project(projectId).runs.push({ start: Date.now(), end: null, uptimeMs: null })
  }

  recordRunEnd(projectId: string, code: number | null = null): void {
    const runs = this.project(projectId).runs
    const open = [...runs].reverse().find((run) => run.end === null)
    if (open) {
      open.end = Date.now()
      open.uptimeMs = open.end - open.start
      open.code = code
    }
    // Keep the most recent 200 runs.
    if (runs.length > 200) {
      this.project(projectId).runs = runs.slice(-200)
    }
  }

  recordResource(projectId: string, cpu: number, memory: number): void {
    const samples = this.project(projectId).samples
    samples.push({ ts: Date.now(), cpu: Math.round(cpu), memory: Math.round(memory) })
    if (samples.length > this.maxSamplesPerProject) {
      this.project(projectId).samples = samples.slice(-this.maxSamplesPerProject)
    }
  }

  // Aggregate raw samples into per-day buckets: { date, avgCpu, maxCpu, avgMem, maxMem, samples }
  getDailyStats(projectId: string): Array<{ date: string; avgCpu: number; maxCpu: number; avgMem: number; maxMem: number; samples: number }> {
    const samples = this.project(projectId).samples
    const days = new Map<string, { date: string; sumCpu: number; maxCpu: number; sumMem: number; maxMem: number; count: number }>()
    for (const sample of samples) {
      const date = new Date(sample.ts).toISOString().slice(0, 10)
      if (!days.has(date)) days.set(date, { date, sumCpu: 0, maxCpu: 0, sumMem: 0, maxMem: 0, count: 0 })
      const day = days.get(date)!
      day.sumCpu += sample.cpu
      day.maxCpu = Math.max(day.maxCpu, sample.cpu)
      day.sumMem += sample.memory
      day.maxMem = Math.max(day.maxMem, sample.memory)
      day.count += 1
    }
    return [...days.values()]
      .map((day) => ({
        date: day.date,
        avgCpu: Math.round(day.sumCpu / day.count),
        maxCpu: day.maxCpu,
        avgMem: Math.round(day.sumMem / day.count),
        maxMem: day.maxMem,
        samples: day.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  getStats(projectId: string) {
    const data = this.project(projectId)
    const runs = data.runs.filter((run) => run.end !== null)
    const totalUptimeMs = runs.reduce((sum, run) => sum + (run.uptimeMs || 0), 0)
    const lastRun = [...runs].reverse()[0] || null
    return {
      crashes: [...data.crashes].reverse(),
      runs: [...runs].reverse().slice(0, 20),
      totalRuns: runs.length,
      totalUptimeMs,
      avgUptimeMs: runs.length ? Math.round(totalUptimeMs / runs.length) : 0,
      lastRun,
      daily: this.getDailyStats(projectId),
    }
  }

  clear(projectId: string): void {
    this.data.projects[projectId] = { crashes: [], runs: [], samples: [] }
  }

  async flush(): Promise<void> {
    try {
      const tempPath = `${this.filePath}.tmp`
      await fs.writeFile(tempPath, JSON.stringify(this.data), 'utf8')
      await fs.rename(tempPath, this.filePath)
    } catch {
      // Non-critical: analytics flush must never block the app.
    }
  }

  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    await this.flush()
  }
}

export default HealthManager


export type { HealthManager }
