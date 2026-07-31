/**
 * Structured Logger for Production Use
 * Provides consistent logging format with levels, timestamps, and context
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILLY: 4
}

class Logger {
  constructor(options = {}) {
    this.namespace = options.namespace || 'app'
    this.level = options.level || LOG_LEVELS.INFO
    this.enableTimestamp = options.enableTimestamp !== false
    this.enableColors = !process.env.CI && process.env.NODE_ENV === 'development'
    
    // Color codes for terminal output
    this.colors = {
      debug: '\x1b[36m',   // Cyan
      info: '\x1b[32m',    // Green
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      silly: '\x1b[35m',   // Magenta
      reset: '\x1b[0m'
    }
  }

  /**
   * Generate formatted timestamp
   */
  timestamp() {
    if (!this.enableTimestamp) return ''
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `[${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}]`
  }

  /**
   * Format message with colors and namespace
   */
  formatMessage(level, message, context = {}) {
    const parts = []
    
    if (this.enableTimestamp) {
      parts.push(this.timestamp())
    }
    
    parts.push(`[${level}]`)
    
    if (this.namespace) {
      parts.push(`[${this.namespace}]`)
    }
    
    let formatted = parts.join(' ')
    
    // Add context object if provided
    if (Object.keys(context).length > 0) {
      const ctxStr = JSON.stringify(context)
      formatted += ` ${ctxStr}`
    }
    
    formatted += ` ${message}`
    
    // Apply colors in development
    if (this.enableColors && this.colors[level.toLowerCase()]) {
      formatted = `${this.colors[level.toLowerCase()]}${formatted}${this.colors.reset}`
    }
    
    return formatted
  }

  shouldLog(level) {
    return level >= this.level
  }

  debug(message, context = {}) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message, context))
    }
  }

  info(message, context = {}) {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      console.log(this.formatMessage('INFO', message, context))
    }
  }

  warn(message, context = {}) {
    if (this.shouldLog(LOG_LEVELS.WARN)) {
      console.warn(this.formatMessage('WARN', message, context))
    }
  }

  error(message, context = {}) {
    if (this.shouldLog(LOG_LEVELS.ERROR)) {
      const formattedMsg = this.formatMessage('ERROR', message, context)
      
      if (context.error instanceof Error) {
        console.error(formattedMsg, {
          name: context.error.name,
          message: context.error.message,
          stack: context.error.stack
        })
      } else {
        console.error(formattedMsg)
      }
    }
  }

  silly(message, context = {}) {
    if (this.shouldLog(LOG_LEVELS.SILLY)) {
      console.debug(this.formatMessage('SILLY', message, context))
    }
  }

  /**
   * Create a namespaced logger instance
   */
  child(namespace) {
    return new Logger({
      namespace: `${this.namespace}.${namespace}`,
      level: this.level,
      enableTimestamp: this.enableTimestamp,
      enableColors: this.enableColors
    })
  }

  /**
   * Set log level
   */
  setLevel(level) {
    if (typeof level === 'string') {
      const upperLevel = level.toUpperCase()
      this.level = LOG_LEVELS[upperLevel] ?? this.level
    } else if (typeof level === 'number') {
      this.level = level
    }
  }

  /**
   * Get current log level name
   */
  getLevelName() {
    return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === this.level)
  }
}

// Create default instances for different contexts
const mainLogger = new Logger({ namespace: 'main', level: LOG_LEVELS.INFO })
const rendererLogger = new Logger({ namespace: 'renderer', level: LOG_LEVELS.INFO })
const electronLogger = new Logger({ namespace: 'electron', level: LOG_LEVELS.INFO })

// Expose both class and singleton instances
module.exports = {
  Logger,
  LOG_LEVELS,
  mainLogger,
  rendererLogger,
  electronLogger,
  createLogger: (options) => new Logger(options)
}
