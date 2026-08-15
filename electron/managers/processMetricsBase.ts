import { ProcessChildBase } from './processChildBase'
import { getProcessResources, getProcessTreeResources } from '../utils/processTree'
import type { STATUS } from './processTypes'

const util = require('util')
const execAsync = util.promisify(require('child_process').exec)
import Logger from '../utils/logger'
const log = Logger || { info: () => {}, warn: () => {}, error: () => {} }

/**
 * Resource metrics + periodic monitoring. Sits near the top of the
 * ProcessManager chain so it can read the processes map and emit
 * `resource-update` / `resources-batch` events.
 */
export abstract class ProcessMetricsBase extends ProcessChildBase {
  abstract STATUS: typeof STATUS

  resourceMonitorInterval: ReturnType<typeof setInterval> | null = null

  getProcessResources(pid: number | string) {
    return getProcessResources(pid)
  }

  getProcessTreeResources(rootPids: number[]) {
    return getProcessTreeResources(rootPids)
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
}
