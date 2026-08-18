import { ProcessLogBase } from './processLogBase'
import { isPortOpen } from '../utils/portCheck'
import type { STATUS } from './processTypes'

const util = require('util')
const execAsync = util.promisify(require('child_process').exec)

/**
 * Port readiness + ownership checks. Depends on the log base (for emit/status
 * and the processes map) but needs nothing from the process-lifecycle layer.
 */
export abstract class ProcessPortBase extends ProcessLogBase {
  abstract STATUS: typeof STATUS

  isPortOpen(port: number, timeout = 250) {
    return isPortOpen(port, timeout)
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

  async waitForCommandPort(projectId: string, port: number, timeout = 60000, runId: symbol | null = null) {
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

  async waitForPort(projectId: string, port: number, timeout = 60000, runId: symbol | null = null, commandId: string | null = null) {
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
}
