const path = require('path')
const fs = require('fs').promises
import Logger from './logger'
const log = Logger || { info: () => {}, warn: () => {}, error: () => {} }

/** Project id → safe filename segment (used inside the log file name). */
function logFilePath(logsDir: string | null | undefined, projectId: string): string | null {
  if (!logsDir) return null
  const safeId = String(projectId).replace(/[^A-Za-z0-9_-]/g, '_')
  return path.join(logsDir, `${safeId}.jsonl`)
}

/** Append one JSON entry to the project log file (never throws). */
async function appendEntry(filePath: string | null | undefined, entry: unknown): Promise<void> {
  if (!filePath) return
  try {
    await fs.appendFile(filePath, JSON.stringify(entry) + '\n', 'utf8')
  } catch {
    // Non-critical: log persistence should not block process flow
  }
}

/** Read + parse all entries from a log file. Returns [] on missing/malformed files. */
async function readEntries(filePath: string | null | undefined): Promise<Array<Record<string, unknown>>> {
  if (!filePath) return []
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.split('\n').filter((line: string) => line.trim())
    const parsed: Array<Record<string, unknown>> = []
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line))
      } catch {
        // Skip malformed lines
      }
    }
    return parsed
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== 'ENOENT') log.warn('ProcessManager', `Failed to load persisted logs for ${filePath}:`, { error: err.message })
    return []
  }
}

/** Keep only the most recent `maxLines` entries in the file. */
async function truncate(filePath: string | null | undefined, maxLines: number): Promise<void> {
  if (!filePath) return
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.split('\n').filter((line: string) => line.trim()).slice(-maxLines)
    await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf8')
  } catch {
    // Non-critical
  }
}

/** Empty the log file (never throws). */
async function clear(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return
  try {
    await fs.writeFile(filePath, '', 'utf8')
  } catch {
    // Non-critical
  }
}

export { logFilePath, appendEntry, readEntries, truncate, clear }

