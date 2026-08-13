// @ts-check
const path = require('path')
const fs = require('fs').promises

/**
 * HealthManager — persists per-project analytics: crash history, run sessions
 * (with uptime), and resource samples rolled up per day. All writes are
 * batched in memory and flushed periodically + on app quit so hot-path
 * resource events never touch the disk.
 */
class HealthManager {
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, 'health.json')
    this.data = { projects: {} } // projectId -> { crashes: [], runs: [], samples: [] }
    this.flushTimer = null
    this.maxSamplesPerProject = 20000
  }

  async init() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw)
      this.data = parsed && typeof parsed === 'object' && parsed.projects ? parsed : { projects: {} }
    } catch {
      this.data = { projects: {} }
    }
    this.flushTimer = setInterval(() => this.flush().catch(() => {}), 30000)
  }

  project(id) {
    if (!this.data.projects[id]) {
      this.data.projects[id] = { crashes: [], runs: [], samples: [] }
    }
    return this.data.projects[id]
  }

  recordCrash(projectId, { code = null, message = null } = {}) {
    const entry = { timestamp: new Date().toISOString(), code, message: (message || '').slice(0, 300) }
    this.project(projectId).crashes.push(entry)
    // Keep the most recent 100 crashes per project.
    if (this.project(projectId).crashes.length > 100) {
      this.project(projectId).crashes = this.project(projectId).crashes.slice(-100)
    }
  }

  recordRunStart(projectId) {
    this.project(projectId).runs.push({ start: Date.now(), end: null, uptimeMs: null })
  }

  recordRunEnd(projectId, code = null) {
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

  recordResource(projectId, cpu, memory) {
    const samples = this.project(projectId).samples
    samples.push({ ts: Date.now(), cpu: Math.round(cpu), memory: Math.round(memory) })
    if (samples.length > this.maxSamplesPerProject) {
      this.project(projectId).samples = samples.slice(-this.maxSamplesPerProject)
    }
  }

  // Aggregate raw samples into per-day buckets: { date, avgCpu, maxCpu, avgMem, maxMem, samples }
  getDailyStats(projectId) {
    const samples = this.project(projectId).samples
    const days = new Map()
    for (const sample of samples) {
      const date = new Date(sample.ts).toISOString().slice(0, 10)
      if (!days.has(date)) days.set(date, { date, sumCpu: 0, maxCpu: 0, sumMem: 0, maxMem: 0, count: 0 })
      const day = days.get(date)
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

  getStats(projectId) {
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

  clear(projectId) {
    this.data.projects[projectId] = { crashes: [], runs: [], samples: [] }
  }

  async flush() {
    try {
      const tempPath = `${this.filePath}.tmp`
      await fs.writeFile(tempPath, JSON.stringify(this.data), 'utf8')
      await fs.rename(tempPath, this.filePath)
    } catch {
      // Non-critical: analytics flush must never block the app.
    }
  }

  async dispose() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    await this.flush()
  }
}

module.exports = HealthManager
