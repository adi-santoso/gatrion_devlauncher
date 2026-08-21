import type { IpcMainInvokeEvent } from 'electron'

/**
 * Centralized IPC payload validation (defense-in-depth).
 *
 * Handlers still own their domain rules (projectSchema, sanitizeProjectChanges,
 * per-argument checks); this layer guarantees shape/type basics before a
 * payload reaches handler logic, so a malformed renderer call cannot slip
 * through with an unexpected type or an unbounded size.
 */

/**
 * A registered IPC handler: receives the trusted event plus validated args.
 * Args are `unknown` at the boundary and narrowed per channel: `assertPayload`
 * (CHANNEL_RULES) runs before the handler, so each positional arg already
 * matches its channel rule (string/integer/object/...) at runtime. Handlers
 * still annotate their own param types; the cast below is the only place that
 * bridges the runtime-validated payloads to their concrete shapes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC boundary: args are runtime-validated dynamic payloads, per-channel static shapes live in CHANNEL_RULES.
export type IpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown

// Terminal input is forwarded straight into a PTY; cap the write size so a
// runaway renderer cannot flood the shell session with a multi-MB string.
const MAX_TERMINAL_INPUT = 65536

// Shared positional shape used by the omp agent RPC channels: a project
// identifier, then a working directory (optional where the handler falls back
// to the user's home), then the channel-specific arguments.
const OMP_CWD: ArgRule = ['cwd', 'string', { optional: true }]

// Centralized shape rules for every channel registered through `safeHandle`
// (all 8 handler files). A channel listed here is type/bounds-checked before
// its handler runs; the completeness is enforced by a regression test that
// registers every handler and asserts each channel has a rule.
const CHANNEL_RULES: Record<string, ArgRule[]> = {
  // --- terminal --------------------------------------------------------
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

  // --- desktop ---------------------------------------------------------
  'open-external-url': [['url', 'string', { minLength: 1, maxLength: 4096 }]],
  'reveal-in-explorer': [['targetPath', 'string', { minLength: 1, maxLength: 4096 }]],
  'open-in-editor': [['targetPath', 'string', { minLength: 1, maxLength: 4096 }]],

  // --- preview (WebContentsView) ---------------------------------------
  'preview-show': [['payload', 'object', { optional: true }]],
  'preview-hide': [['projectId', 'string', { minLength: 1 }]],
  'preview-set-bounds': [
    ['projectId', 'string', { minLength: 1 }],
    ['bounds', 'object'],
  ],
  'preview-navigate': [
    ['projectId', 'string', { minLength: 1 }],
    ['url', 'string', { minLength: 1, maxLength: 8192 }],
  ],
  'preview-reload': [['projectId', 'string', { minLength: 1 }]],
  'preview-zoom': [
    ['projectId', 'string', { minLength: 1 }],
    ['zoomLevel', 'number'],
  ],
  'preview-toggle-devtools': [['projectId', 'string', { minLength: 1 }]],
  'preview-clear-data': [['projectId', 'string', { minLength: 1 }]],
  'preview-nudge': [['projectId', 'string', { minLength: 1 }]],
  'preview-destroy': [['projectId', 'string', { minLength: 1 }]],

  // --- process lifecycle -----------------------------------------------
  'start-project': [['projectId', 'string', { minLength: 1 }]],
  'stop-project': [
    ['projectId', 'string', { minLength: 1 }],
    ['force', 'boolean', { optional: true }],
  ],
  'restart-project': [['projectId', 'string', { minLength: 1 }]],
  'get-process-status': [['projectId', 'string', { minLength: 1 }]],
  'check-port-conflict': [['port', 'integer', { min: 1, max: 65535 }]],
  'get-process-metrics': [['projectId', 'string', { minLength: 1 }]],
  'get-logs': [
    ['projectId', 'string', { minLength: 1 }],
    ['limit', 'integer', { optional: true, min: 1, max: 100000 }],
  ],
  'clear-logs': [['projectId', 'string', { minLength: 1 }]],
  'start-all-projects': [
    ['projectIds', 'stringArray', { optional: true, maxLength: 500 }],
    ['options', 'object', { optional: true }],
  ],
  'run-custom-command': [
    ['projectId', 'string', { minLength: 1 }],
    ['commandId', 'string', { minLength: 1 }],
  ],
  'stop-custom-command': [['runId', 'integer']],
  'get-custom-command-status': [['runId', 'integer']],
  'stop-all-projects': [],

  // --- project CRUD + workspace ----------------------------------------
  'get-projects': [],
  'add-project': [['projectData', 'object']],
  'update-project': [
    ['projectId', 'string', { minLength: 1 }],
    ['updates', 'object'],
  ],
  'delete-project': [['projectId', 'string', { minLength: 1 }]],
  'export-projects': [],
  'import-projects': [],
  'workspace-search-files': [
    ['query', 'string', { minLength: 1, maxLength: 100 }],
    ['projectPaths', 'stringArray', { optional: true, maxLength: 200 }],
  ],
  'browse-folder': [],
  'list-env-files': [['projectPath', 'string', { minLength: 1 }]],
  'read-env-file': [
    ['projectPath', 'string', { minLength: 1 }],
    ['fileName', 'string', { minLength: 1, maxLength: 120 }],
  ],
  'write-env-file': [
    ['projectPath', 'string', { minLength: 1 }],
    ['fileName', 'string', { minLength: 1, maxLength: 120 }],
    ['content', 'string', { maxLength: 2 * 1024 * 1024 }],
  ],

  // --- git + package tooling -------------------------------------------
  'git-status': [['projectPath', 'string', { minLength: 1 }]],
  'git-log': [
    ['projectPath', 'string', { minLength: 1 }],
    ['limit', 'integer', { optional: true, min: 1, max: 100 }],
  ],
  'git-diff': [
    ['projectPath', 'string', { minLength: 1 }],
    ['filePath', 'string', { minLength: 1, maxLength: 4096 }],
    ['staged', 'boolean', { optional: true }],
  ],
  'git-stage': [
    ['projectPath', 'string', { minLength: 1 }],
    ['files', 'stringArray', { maxLength: 500 }],
  ],
  'git-unstage': [
    ['projectPath', 'string', { minLength: 1 }],
    ['files', 'stringArray', { maxLength: 500 }],
  ],
  'git-commit': [
    ['projectPath', 'string', { minLength: 1 }],
    ['message', 'string', { minLength: 1, maxLength: 2000 }],
  ],
  'git-pull': [['projectPath', 'string', { minLength: 1 }]],
  'git-push': [['projectPath', 'string', { minLength: 1 }]],
  'git-checkout': [
    ['projectPath', 'string', { minLength: 1 }],
    ['branch', 'string', { minLength: 1, maxLength: 200 }],
    ['createNew', 'boolean', { optional: true }],
  ],
  'git-init': [['projectPath', 'string', { minLength: 1 }]],
  'git-stash-list': [['projectPath', 'string', { minLength: 1 }]],
  'git-stash-push': [
    ['projectPath', 'string', { minLength: 1 }],
    ['message', 'string', { optional: true, maxLength: 200 }],
  ],
  'git-stash-pop': [
    ['projectPath', 'string', { minLength: 1 }],
    ['index', 'integer', { optional: true, min: 0 }],
  ],
  'git-stash-apply': [
    ['projectPath', 'string', { minLength: 1 }],
    ['index', 'integer', { optional: true, min: 0 }],
  ],
  'git-stash-drop': [
    ['projectPath', 'string', { minLength: 1 }],
    ['index', 'integer', { optional: true, min: 0 }],
  ],
  'git-discard': [
    ['projectPath', 'string', { minLength: 1 }],
    ['filePath', 'string', { minLength: 1, maxLength: 4096 }],
  ],
  'git-blame': [
    ['projectPath', 'string', { minLength: 1 }],
    ['filePath', 'string', { minLength: 1, maxLength: 4096 }],
  ],
  'read-package-scripts': [['projectPath', 'string', { minLength: 1 }]],
  'check-dependencies': [['projectPath', 'string', { minLength: 1 }]],
  'run-project-script': [
    ['projectId', 'string', { minLength: 1 }],
    ['scriptName', 'string', { minLength: 1, maxLength: 120 }],
  ],
  'npm-outdated': [['projectPath', 'string', { minLength: 1 }]],
  'npm-update': [
    ['projectPath', 'string', { minLength: 1 }],
    ['packageName', 'string', { optional: true, maxLength: 200 }],
  ],
  'composer-outdated': [['projectPath', 'string', { minLength: 1 }]],
  'composer-update': [
    ['projectPath', 'string', { minLength: 1 }],
    ['packageName', 'string', { optional: true, maxLength: 200 }],
  ],
  'go-outdated': [['projectPath', 'string', { minLength: 1 }]],
  'go-update': [
    ['projectPath', 'string', { minLength: 1 }],
    ['moduleName', 'string', { minLength: 1, maxLength: 200 }],
  ],
  'pip-outdated': [['projectPath', 'string', { minLength: 1 }]],
  'pip-update': [
    ['projectPath', 'string', { minLength: 1 }],
    ['packageName', 'string', { minLength: 1, maxLength: 200 }],
  ],
  'cargo-outdated': [['projectPath', 'string', { minLength: 1 }]],
  'cargo-update': [
    ['projectPath', 'string', { minLength: 1 }],
    ['packageName', 'string', { minLength: 1, maxLength: 200 }],
  ],
  'install-dependencies': [['projectId', 'string', { minLength: 1 }]],

  // --- system ----------------------------------------------------------
  'system-env-check': [],
  'export-diagnostics': [],
  'get-main-log': [
    ['limit', 'integer', { optional: true, min: 10, max: 5000 }],
  ],
  'get-crash-dumps': [],
  'clear-crash-dumps': [],
  'open-crash-dumps-folder': [],
  'reset-app-data': [],

  // --- workspace backup -------------------------------------------------
  'backup-export': [['password', 'string', { optional: true, maxLength: 512 }]],
  'backup-import': [['password', 'string', { optional: true, maxLength: 512 }]],

  // --- omp agent (oh-my-pi) --------------------------------------------
  'omp-status': [],
  'omp-list-sessions': [['projectId', 'string', { minLength: 1 }]],
  'omp-list-all-sessions': [],
  'omp-create-session': [
    ['projectId', 'string', { minLength: 1 }],
    ['title', 'string', { optional: true, maxLength: 80 }],
  ],
  'omp-delete-session': [
    ['projectId', 'string', { minLength: 1 }],
    ['sessionId', 'string', { minLength: 1 }],
  ],
  'omp-update-session-tokens': [
    ['projectId', 'string', { minLength: 1 }],
    ['sessionId', 'string', { minLength: 1 }],
    ['tokens', 'integer', { min: 0 }],
    ['cost', 'number', { optional: true, min: 0 }],
  ],
  'omp-rename-session': [
    ['projectId', 'string', { minLength: 1 }],
    ['sessionId', 'string', { minLength: 1 }],
    ['title', 'string', { minLength: 1, maxLength: 80 }],
  ],
  'omp-chat': [
    ['projectId', 'string', { minLength: 1 }],
    ['cwd', 'string', { minLength: 1 }],
    ['message', 'string', { maxLength: 20000 }],
    ['options', 'object', { optional: true }],
  ],
  'omp-steer': [
    ['projectId', 'string', { minLength: 1 }],
    ['cwd', 'string', { minLength: 1 }],
    ['message', 'string', { minLength: 1, maxLength: 20000 }],
  ],
  'omp-abort': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
  ],
  'omp-get-messages': [
    ['projectId', 'string', { minLength: 1 }],
    ['cwd', 'string', { minLength: 1 }],
    ['options', 'object', { optional: true }],
  ],
  'omp-get-models': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
  ],
  'omp-set-model': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
    ['provider', 'string', { minLength: 1, maxLength: 80 }],
    ['modelId', 'string', { minLength: 1, maxLength: 120 }],
  ],
  'omp-set-thinking-level': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
    ['level', 'string', { minLength: 1, maxLength: 20 }],
  ],
  'omp-get-state': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
  ],
  'omp-compact': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
    ['customInstructions', 'string', { optional: true, maxLength: 2000 }],
  ],
  'omp-set-auto-compaction': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
    ['enabled', 'boolean'],
  ],
  'omp-set-auto-retry': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
    ['enabled', 'boolean'],
  ],
  'omp-abort-retry': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
  ],
  'omp-set-fast-mode': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
    ['enabled', 'boolean'],
  ],
  'omp-get-commands': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
  ],
  'omp-export-conversation': [
    ['projectId', 'string', { minLength: 1 }],
    ['cwd', 'string', { minLength: 1 }],
    ['sessionPath', 'string', { optional: true, maxLength: 1024 }],
    ['title', 'string', { optional: true, maxLength: 80 }],
  ],
  'omp-toggle-pin': [
    ['projectId', 'string', { minLength: 1 }],
    ['sessionId', 'string', { minLength: 1 }],
  ],
  'omp-branch': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
    ['entryId', 'string', { minLength: 1 }],
  ],
  'omp-get-branch-messages': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
  ],
  'omp-set-subagent-subscription': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
    ['level', 'string', { minLength: 1, maxLength: 20 }],
  ],
  'omp-get-subagents': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
  ],
  'omp-handoff': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
    ['customInstructions', 'string', { minLength: 1, maxLength: 2000 }],
  ],
  'omp-bash': [
    ['projectId', 'string', { minLength: 1 }],
    ['cwd', 'string', { minLength: 1 }],
    ['command', 'string', { minLength: 1, maxLength: 2000 }],
  ],
  'omp-abort-bash': [
    ['projectId', 'string', { minLength: 1 }],
    OMP_CWD,
  ],
  'omp-install': [],
  'omp-install-state': [],
  'omp-check-update': [],
  'omp-config-get': [],
  'omp-config-save-provider': [['input', 'object']],
  'omp-config-delete-provider': [['name', 'string', { minLength: 1, maxLength: 60 }]],
  'omp-config-set-default': [['modelRef', 'string', { minLength: 1, maxLength: 120 }]],
  'omp-run-setup': [],
  'omp-open-docs': [],
}

interface ArgRuleOpts {
  optional?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
}

type ArgRule = [name: string, type: string, opts?: ArgRuleOpts]

function validateArg(value: unknown, rule: ArgRule): string | null {
  const [name, type, opts = {}] = rule
  // Optional positional args may be omitted (undefined) or explicitly null —
  // the renderer passes `null` for e.g. `npm-update` packageName.
  if ((value === undefined || value === null) && opts.optional) return null

  switch (type) {
    case 'string':
      if (typeof value !== 'string') return `${name} must be a string`
      if (opts.minLength != null && value.length < opts.minLength) return `${name} is required`
      if (opts.maxLength != null && value.length > opts.maxLength) return `${name} is too long (max ${opts.maxLength} chars)`
      return null
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) return `${name} must be an integer`
      if (opts.min != null && value < opts.min) return `${name} must be >= ${opts.min}`
      if (opts.max != null && value > opts.max) return `${name} must be <= ${opts.max}`
      return null
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${name} must be a number`
      if (opts.min != null && value < opts.min) return `${name} must be >= ${opts.min}`
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
function assertPayload(channel: string, args: unknown[], overrides?: ArgRule[]): void {
  const rules = overrides || CHANNEL_RULES[channel]
  if (!rules) return
  for (let index = 0; index < rules.length; index++) {
    const error = validateArg(args[index], rules[index])
    if (error) throw new Error(`Invalid IPC payload for "${channel}": ${error}`)
  }
}

/**
 * Register an IPC channel with a uniform envelope.
 *
 * Every channel in the app speaks the same contract: success returns the
 * handler's `{ success: true, ... }` value; any throw (including untrusted
 * sender or invalid payload) becomes `{ success: false, error }`. No channel
 * ever rejects, so the renderer can always check `result?.success`.
 *
 * `ipcMain` and `assertTrusted` are passed in (not imported) so this helper
 * stays Electron-free and unit-testable.
 */
function safeHandle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches electron's own `ipcMain.handle` listener typing.
  ipcMain: { handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void },
  assertTrusted: (event: IpcMainInvokeEvent) => void,
  channel: string,
  handler: IpcHandler,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      assertTrusted(event)
      assertPayload(channel, args)
      return await handler(event, ...args)
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}

export { assertPayload, safeHandle, CHANNEL_RULES }

