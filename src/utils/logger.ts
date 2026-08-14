/**
 * Structured Logger for Production Use
 * Provides consistent logging format with levels, timestamps, and context
 */

export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILLY: 4,
} as const

export type LogLevelName = keyof typeof LOG_LEVELS

interface LoggerOptions {
  namespace?: string
  level?: number
  enableTimestamp?: boolean
  enableColors?: boolean
}

interface LogContext {
  [key: string]: unknown
  error?: Error
}

export class Logger {
  namespace: string
  level: number
  enableTimestamp: boolean
  enableColors: boolean

  private colors: Record<string, string> = {
    debug: '\x1b[36m',   // Cyan
    info: '\x1b[32m',    // Green
    warn: '\x1b[33m',    // Yellow
    error: '\x1b[31m',   // Red
    silly: '\x1b[35m',   // Magenta
    reset: '\x1b[0m',
  }

  constructor(options: LoggerOptions = {}) {
    this.namespace = options.namespace || 'app'
    this.level = options.level ?? LOG_LEVELS.INFO
    this.enableTimestamp = options.enableTimestamp !== false
    // `process` may be absent in pure browser builds; probe via globalThis.
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    this.enableColors = options.enableColors ?? (!proc?.env?.CI && proc?.env?.NODE_ENV === 'development')
  }

  /**
   * Generate formatted timestamp
   */
  timestamp(): string {
    if (!this.enableTimestamp) return ''
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `[${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}]`
  }

  /**
   * Format message with colors and namespace
   */
  formatMessage(level: string, message: string, context: LogContext = {}): string {
    const parts: string[] = []

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

  shouldLog(level: number): boolean {
    return level >= this.level
  }

  debug(message: string, context: LogContext = {}): void {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message, context))
    }
  }

  info(message: string, context: LogContext = {}): void {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      console.log(this.formatMessage('INFO', message, context))
    }
  }

  warn(message: string, context: LogContext = {}): void {
    if (this.shouldLog(LOG_LEVELS.WARN)) {
      console.warn(this.formatMessage('WARN', message, context))
    }
  }

  error(message: string, context: LogContext = {}): void {
    if (this.shouldLog(LOG_LEVELS.ERROR)) {
      const formattedMsg = this.formatMessage('ERROR', message, context)

      if (context.error instanceof Error) {
        console.error(formattedMsg, {
          name: context.error.name,
          message: context.error.message,
          stack: context.error.stack,
        })
      } else {
        console.error(formattedMsg)
      }
    }
  }

  silly(message: string, context: LogContext = {}): void {
    if (this.shouldLog(LOG_LEVELS.SILLY)) {
      console.debug(this.formatMessage('SILLY', message, context))
    }
  }

  /**
   * Create a namespaced logger instance
   */
  child(namespace: string): Logger {
    return new Logger({
      namespace: `${this.namespace}.${namespace}`,
      level: this.level,
      enableTimestamp: this.enableTimestamp,
      enableColors: this.enableColors,
    })
  }

  /**
   * Set log level
   */
  setLevel(level: number | string): void {
    if (typeof level === 'string') {
      const upperLevel = level.toUpperCase()
      this.level = LOG_LEVELS[upperLevel as LogLevelName] ?? this.level
    } else if (typeof level === 'number') {
      this.level = level
    }
  }

  /**
   * Get current log level name
   */
  getLevelName(): string | undefined {
    return (Object.keys(LOG_LEVELS) as LogLevelName[]).find((key) => LOG_LEVELS[key] === this.level)
  }
}

// Create default instances for different contexts
export const mainLogger = new Logger({ namespace: 'main', level: LOG_LEVELS.INFO })
export const rendererLogger = new Logger({ namespace: 'renderer', level: LOG_LEVELS.INFO })
export const electronLogger = new Logger({ namespace: 'electron', level: LOG_LEVELS.INFO })

export const createLogger = (options: LoggerOptions): Logger => new Logger(options)

export default Logger
