// @ts-check
const path = require('path')
const fs = require('fs').promises
const Logger = require('./logger')
const log = Logger || { info: () => {}, warn: () => {}, error: () => {} }

/** Project id → safe filename segment (used inside the log file name). */
function logFilePath(logsDir, projectId) {
  if (!logsDir) return null
  const safeId = String(projectId).replace(/[^A-Za-z0-9_-]/g, '_')
  return path.join(logsDir, `${safeId}.jsonl`)
}

/** Append one JSON entry to the project log file (never throws). */
async function appendEntry(filePath, entry) {
  if (!filePath) return
  try {
    await fs.appendFile(filePath, JSON.stringify(entry) + '\n', 'utf8')
  } catch {
    // Non-critical: log persistence should not block process flow
  }
}

/** Read + parse all entries from a log file. Returns [] on missing/malformed files. */
async function readEntries(filePath) {
  if (!filePath) return []
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.split('\n').filter((line) => line.trim())
    const parsed = []
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line))
      } catch {
        // Skip malformed lines
      }
    }
    return parsed
  } catch (error) {
    if (error.code !== 'ENOENT') log.warn('ProcessManager', `Failed to load persisted logs for ${filePath}:`, error.message)
    return []
  }
}

/** Keep only the most recent `maxLines` entries in the file. */
async function truncate(filePath, maxLines) {
  if (!filePath) return
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.split('\n').filter((line) => line.trim()).slice(-maxLines)
    await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf8')
  } catch {
    // Non-critical
  }
}

/** Empty the log file (never throws). */
async function clear(filePath) {
  if (!filePath) return
  try {
    await fs.writeFile(filePath, '', 'utf8')
  } catch {
    // Non-critical
  }
}

module.exports = { logFilePath, appendEntry, readEntries, truncate, clear }
