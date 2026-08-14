/**
 * Centralized IPC payload validation (defense-in-depth).
 *
 * Handlers still own their domain rules (projectSchema, sanitizeProjectChanges,
 * per-argument checks); this layer guarantees shape/type basics before a
 * payload reaches handler logic, so a malformed renderer call cannot slip
 * through with an unexpected type or an unbounded size.
 */

// Terminal input is forwarded straight into a PTY; cap the write size so a
// runaway renderer cannot flood the shell session with a multi-MB string.
const MAX_TERMINAL_INPUT = 65536

const CHANNEL_RULES = {
  'terminal-create': [['options', 'object', { optional: true }]],
  'terminal-input': [
    ['id', 'string'],
    ['data', 'string', { maxLength: MAX_TERMINAL_INPUT }],
  ],
  'terminal-resize': [
    ['id', 'string'],
    ['cols', 'integer', { min: 1, max: 500 }],
    ['rows', 'integer', { min: 1, max: 500 }],
  ],
  'terminal-kill': [['id', 'string']],
  'stop-project': [
    ['projectId', 'string', { minLength: 1 }],
    ['force', 'boolean', { optional: true }],
  ],
  'stop-custom-command': [['runId', 'integer']],
  'start-all-projects': [
    ['projectIds', 'stringArray', { optional: true, maxLength: 500 }],
    ['options', 'object', { optional: true }],
  ],
}

function validateArg(value, rule) {
  const [name, type, opts = {}] = rule
  if (value === undefined && opts.optional) return null

  switch (type) {
    case 'string':
      if (typeof value !== 'string') return `${name} must be a string`
      if (opts.minLength != null && value.length < opts.minLength) return `${name} is required`
      if (opts.maxLength != null && value.length > opts.maxLength) return `${name} is too long (max ${opts.maxLength} chars)`
      return null
    case 'integer':
      if (!Number.isInteger(value)) return `${name} must be an integer`
      if (opts.min != null && value < opts.min) return `${name} must be >= ${opts.min}`
      if (opts.max != null && value > opts.max) return `${name} must be <= ${opts.max}`
      return null
    case 'boolean':
      return typeof value === 'boolean' ? null : `${name} must be a boolean`
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? null
        : `${name} must be an object`
    case 'stringArray':
      if (!Array.isArray(value)) return `${name} must be an array`
      if (opts.maxLength != null && value.length > opts.maxLength) return `${name} has too many items (max ${opts.maxLength})`
      if (value.some((item) => typeof item !== 'string' || !item.trim())) return `${name} must contain only non-empty strings`
      return null
    default:
      return null
  }
}

/**
 * Validate an IPC handler's positional args against the channel rule list.
 * Throws an Error with a descriptive message on the first violation.
 * Channels without rules are left to their per-handler checks.
 */
function assertPayload(channel, args, overrides) {
  const rules = overrides || CHANNEL_RULES[channel]
  if (!rules) return
  for (let index = 0; index < rules.length; index++) {
    const error = validateArg(args[index], rules[index])
    if (error) throw new Error(`Invalid IPC payload for "${channel}": ${error}`)
  }
}

module.exports = { assertPayload, CHANNEL_RULES }
