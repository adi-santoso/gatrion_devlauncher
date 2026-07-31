const fs = require('fs').promises
const path = require('path')

let LOG_DIR
let MAIN_LOG_FILE

try {
  const { app } = require('electron')
  LOG_DIR = path.join(app.getPath('userData'), 'logs')
  MAIN_LOG_FILE = path.join(LOG_DIR, 'main.log')
} catch (e) {
  // Running outside Electron - use temp dir for logging
  LOG_DIR = process.env.TEMP || process.env.TMPDIR || '/tmp'
  MAIN_LOG_FILE = path.join(LOG_DIR, 'devlauncher-main.log')
}

let logStream = null

async function ensureLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
  } catch (error) {
    // Ignore if directory already exists or can't be created
  }
}

async function writeLog(level, module, message, metadata = {}) {
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
    
    // Keep only last 1000 lines (~10MB max)
    await rotateLogFile()
  } catch (error) {
    console.error('[Logger] Failed to write to file:', error)
  }
}

async function rotateLogFile() {
  try {
    const stats = await fs.stat(MAIN_LOG_FILE).catch(() => null)
    if (!stats || stats.size < 10 * 1024 * 1024) return
    
    const backupPath = MAIN_LOG_FILE + '.old'
    await fs.rename(MAIN_LOG_FILE, backupPath)
    
    const lines = await countLines(backupPath)
    if (lines > 1000) {
      const truncated = await truncateToLastLines(backupPath, 1000)
      await fs.writeFile(MAIN_LOG_FILE, truncated, 'utf8')
      await fs.unlink(backupPath)
    }
  } catch (error) {
    // Ignore rotation errors
  }
}

async function countLines(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return content.split('\n').length - 1
  } catch {
    return 0
  }
}

async function truncateToLastLines(filePath, lineCount) {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.split('\n')
    return lines.slice(-lineCount).join('\n')
  } catch {
    return ''
  }
}

function isProduction() {
  return process.env.NODE_ENV === 'production' || !process.argv.includes('--dev')
}

const Logger = {
  info(module, message, metadata) {
    writeLog('INFO', module, message, metadata)
  },
  
  warn(module, message, metadata) {
    writeLog('WARN', module, message, metadata)
  },
  
  error(module, message, metadata) {
    writeLog('ERROR', module, message, metadata)
  },
  
  debug(module, message, metadata) {
    writeLog('DEBUG', module, message, metadata)
  },
  
  fatal(module, message, metadata) {
    writeLog('FATAL', module, message, metadata)
  }
}

module.exports = Logger
