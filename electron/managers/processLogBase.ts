import { EventEmitter } from 'events'
import { logFilePath, appendEntry, readEntries, truncate, clear } from '../utils/logStore'
import type { LogObject, ProcessData, STATUS } from './processTypes'

/**
 * Log persistence + in-memory buffer for managed processes. Sits at the
 * bottom of the ProcessManager inheritance chain so every subclass can log
 * through `addLog` without duplicating the buffer logic.
 */
export abstract class ProcessLogBase extends EventEmitter {
  abstract processes: Map<string, ProcessData>
  abstract STATUS: typeof STATUS

  logsDir: string | null = null
  nextLogId = 1
  maxLogLines = 1000

  setLogsDir(dir: string | null) {
    this.logsDir = dir
  }

  getLogFilePath(projectId: string) {
    return logFilePath(this.logsDir, projectId)
  }

  async persistLog(projectId: string, entry: LogObject) {
    await appendEntry(this.getLogFilePath(projectId), entry)
  }

  async loadPersistedLogs(projectId: string, limit: number | null = null) {
    const parsed = (await readEntries(this.getLogFilePath(projectId))) as unknown as LogObject[]
    for (const entry of parsed) entry.id = this.nextLogId++
    const safeLimit = typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? Math.min(limit, this.maxLogLines) : this.maxLogLines
    return parsed.slice(-safeLimit)
  }

  async truncateLogFile(projectId: string) {
    await truncate(this.getLogFilePath(projectId), this.maxLogLines)
  }

  /**
   * Add log line to buffer
   * @param projectId Project ID
   * @param logLine Log line
   * @param type Log type (stdout, stderr, error, system)
   */
  addLog(projectId: string, logLine: string, type = 'stdout', commandId: string | null = null, commandName: string | null = null): LogObject | undefined {
    if (!this.processes.has(projectId)) return

    const processData = this.processes.get(projectId)!
    const timestamp = new Date().toISOString()
    const cleanLine = typeof logLine === 'string'
      ? logLine.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
      : logLine

    const entry: LogObject = {
      id: this.nextLogId++,
      timestamp,
      type,
      message: cleanLine,
      commandId,
      commandName,
    }
    processData.logs.push(entry)

    // Keep only the most recent log lines (bounded to configured max)
    if (processData.logs.length > this.maxLogLines) {
      processData.logs.shift()
    }

    this.persistLog(projectId, entry)

    return entry
  }

  /**
   * Get logs for a project
   * @param projectId Project ID
   * @param limit Maximum number of logs to return
   */
  getLogs(projectId: string, limit = this.maxLogLines) {
    if (!this.processes.has(projectId)) return []
    const processData = this.processes.get(projectId)!
    const safeLimit = Number.isInteger(limit) && limit >= 0 ? Math.min(limit, this.maxLogLines) : this.maxLogLines
    return safeLimit === 0 ? [] : processData.logs.slice(-safeLimit)
  }

  /**
   * Clear logs for a project
   * @param projectId Project ID
   */
  clearLogs(projectId: string) {
    if (!this.processes.has(projectId)) return
    const processData = this.processes.get(projectId)!
    processData.logs = []
    clear(this.getLogFilePath(projectId))
  }
}
