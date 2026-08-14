const fs = require('fs').promises
const path = require('path')
import { rotateLogFile } from './logRotation'

let LOG_DIR: string
let MAIN_LOG_FILE: string

try {
  const { app } = require('electron') as typeof import('electron')
  LOG_DIR = path.join(app.getPath('userData'), 'logs')
  MAIN_LOG_FILE = path.join(LOG_DIR, 'main.log')
} catch (e) {
  // Running outside Electron - use temp dir for logging
  LOG_DIR = process.env.TEMP || process.env.TMPDIR || '/tmp'
  MAIN_LOG_FILE = path.join(LOG_DIR, 'devlauncher-main.log')
}

let writeQueue = Promise.resolve()

async function ensureLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
  } catch (error) {
    // Ignore if directory already exists or can't be created
  }
}

async function writeLog(level: string, module: string, message?: unknown, metadata: Record<string, unknown> = {}) {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    module,
    message,
    ...metadata
  }

  const jsonString = JSON.stringify(logEntry)

  if (!isProduction()) {
    const prefix = `[${level}] [${module}]`
    if (level === 'ERROR' || level === 'WARN') {
      console.error(prefix, message)
      if (Object.keys(metadata).length > 0) {
        console.error(metadata)
      }
    } else if (level === 'DEBUG') {
      console.debug(prefix, message)
    } else {
      console.log(prefix, message)
    }
  }

  try {
    await ensureLogDir()
    await fs.appendFile(MAIN_LOG_FILE, jsonString + '\n', 'utf8')

    // Keep only last 1000 lines (~10MB max).
    await rotateLogFile(MAIN_LOG_FILE)
  } catch (error) {
    console.error('[Logger] Failed to write to file:', error)
  }
}

function isProduction() {
  return process.env.NODE_ENV === 'production' || !process.argv.includes('--dev')
}

function enqueueLog(level: string, module: string, message: unknown | undefined, metadata: Record<string, unknown> | undefined) {
  const result = writeQueue.then(() => writeLog(level, module, message, metadata))
  writeQueue = result.catch(() => {})
  return result
}

const Logger = {
  info(module: string, message?: unknown, metadata?: Record<string, unknown>) {
    return enqueueLog('INFO', module, message, metadata)
  },

  warn(module: string, message?: unknown, metadata?: Record<string, unknown>) {
    return enqueueLog('WARN', module, message, metadata)
  },

  error(module: string, message?: unknown, metadata?: Record<string, unknown>) {
    return enqueueLog('ERROR', module, message, metadata)
  },

  debug(module: string, message?: unknown, metadata?: Record<string, unknown>) {
    return enqueueLog('DEBUG', module, message, metadata)
  },

  fatal(module: string, message?: unknown, metadata?: Record<string, unknown>) {
    return enqueueLog('FATAL', module, message, metadata)
  }
}

export default Logger

