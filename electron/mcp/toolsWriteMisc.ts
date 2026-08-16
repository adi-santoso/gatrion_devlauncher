/**
 * F2 write MCP tools (misc): terminal PTY, embedded preview control, .env
 * merge, safe config updates and activity logging. Values written to .env are
 * never echoed back to the agent.
 */
import type { McpTool } from './toolsShared'
import { resolveProject, requireString } from './toolsShared'
import { terminalApi } from '../handlers/terminalHandlers'

const projectIdSchema = { type: 'object', properties: { projectId: { type: 'string', description: 'DevLauncher project id' } }, required: ['projectId'] }

export function createWriteMiscTools(): McpTool[] {
  return [
    // ── terminal ─────────────────────────────────────────────────────────────
    {
      name: 'devlauncher_terminal_create',
      description: 'Open a real PTY terminal in a project folder. Returns a terminal id for devlauncher_terminal_input.',
      inputSchema: projectIdSchema,
      permission: 'write',
      handler: async (args, d) => {
        const p = await resolveProject(d, args.projectId)
        const result = terminalApi.create({ cwd: p.path, shell: process.platform === 'win32' ? 'powershell.exe' : undefined })
        if (!result.success || !result.id) throw new Error(result.error || 'Failed to create terminal')
        return { success: true, id: result.id, cwd: p.path }
      },
    },
    {
      name: 'devlauncher_terminal_input',
      description: 'Write input to a terminal created by devlauncher_terminal_create.',
      inputSchema: {
        type: 'object',
        properties: { terminalId: { type: 'string' }, data: { type: 'string', description: 'Input including newline to run a command' } },
        required: ['terminalId', 'data'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args) => terminalApi.input(requireString(args, 'terminalId'), requireString(args, 'data')),
    },
    {
      name: 'devlauncher_terminal_kill',
      description: 'Close a terminal created by devlauncher_terminal_create.',
      inputSchema: { type: 'object', properties: { terminalId: { type: 'string' } }, required: ['terminalId'], additionalProperties: false },
      permission: 'write',
      handler: async (args) => terminalApi.kill(requireString(args, 'terminalId')),
    },

    // ── preview ──────────────────────────────────────────────────────────────
    {
      name: 'devlauncher_preview_open',
      description: 'Show the embedded preview of a project (url optional — defaults to the project port).',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, url: { type: 'string' } },
        required: ['projectId'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const p = await resolveProject(d, args.projectId)
        const url = typeof args.url === 'string' && args.url ? args.url : p.port ? `http://localhost:${p.port}` : ''
        if (!url) throw new Error('Project has no port; pass an explicit url')
        d.previewManager.show({ projectId: p.id, url })
        return { success: true, url }
      },
    },
    {
      name: 'devlauncher_preview_reload',
      description: 'Reload the embedded preview of a project.',
      inputSchema: projectIdSchema,
      permission: 'write',
      handler: async (args, d) => {
        const p = await resolveProject(d, args.projectId)
        d.previewManager.reload(p.id)
        return { success: true }
      },
    },
    {
      name: 'devlauncher_preview_navigate',
      description: 'Navigate the embedded preview of a project to a URL.',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, url: { type: 'string' } },
        required: ['projectId', 'url'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const p = await resolveProject(d, args.projectId)
        const url = requireString(args, 'url')
        if (url.length > 4000) throw new Error('url is too long')
        d.previewManager.navigate(p.id, url)
        return { success: true }
      },
    },

    // ── env + config + activity ──────────────────────────────────────────────
    {
      name: 'devlauncher_env_write',
      description: 'Merge key/value entries into a project .env file. Values are never echoed back to the agent.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          entries: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] } },
        },
        required: ['projectId', 'entries'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const p = await resolveProject(d, args.projectId)
        const entries = Array.isArray(args.entries) ? args.entries : []
        if (entries.length === 0) throw new Error('entries must not be empty')
        if (entries.length > 100) throw new Error('too many entries')
        const parsed: Array<{ key: string; value: string }> = []
        for (const raw of entries) {
          const entry = raw as Record<string, unknown>
          const key = typeof entry?.key === 'string' ? entry.key : ''
          const value = typeof entry?.value === 'string' ? entry.value : ''
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid env key: ${key}`)
          parsed.push({ key, value })
        }
        const fs = await import('fs')
        const path = await import('path')
        const envFile = path.join(p.path, '.env')
        let lines: string[] = []
        try { lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/) } catch { /* new file */ }
        const existing = new Map<string, number>()
        lines.forEach((line, index) => {
          const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line.trim())
          if (m) existing.set(m[1], index)
        })
        for (const { key, value } of parsed) {
          if (existing.has(key)) lines[existing.get(key)!] = `${key}=${value}`
          else lines.push(`${key}=${value}`)
        }
        fs.writeFileSync(envFile, lines.join('\n') + '\n')
        return { success: true, writtenKeys: parsed.map((e) => e.key) }
      },
    },
    {
      name: 'devlauncher_config_update',
      description: 'Update safe DevLauncher settings: theme (dark/light/system), language (en/id), sidebarExpanded, notifications.*, terminal.fontSize/maxLines/autoScroll.',
      inputSchema: {
        type: 'object',
        properties: {
          theme: { type: 'string', enum: ['dark', 'light', 'system'] },
          language: { type: 'string', enum: ['en', 'id'] },
          sidebarExpanded: { type: 'boolean' },
          notifications: { type: 'object', properties: { onStart: { type: 'boolean' }, onError: { type: 'boolean' }, sound: { type: 'boolean' } } },
          terminal: { type: 'object', properties: { fontSize: { type: 'number' }, maxLines: { type: 'number' }, autoScroll: { type: 'boolean' } } },
        },
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const keys = ['theme', 'language', 'sidebarExpanded', 'notifications', 'terminal'] as const
        for (const key of keys) {
          if (!(key in args)) continue
          if (key === 'theme' && !['dark', 'light', 'system'].includes(String(args[key]))) throw new Error('invalid theme')
          if (key === 'language' && !['en', 'id'].includes(String(args[key]))) throw new Error('invalid language')
        }
        const updates: Record<string, unknown> = {}
        for (const key of keys) if (key in args) updates[key] = args[key]
        const config = await d.storageManager.updateConfig(updates as never)
        // Broadcast so the UI reflects the change immediately.
        const win = d.getWindow()
        if (win && !win.isDestroyed()) win.webContents.send('config-updated', config)
        return { success: true }
      },
    },
    {
      name: 'devlauncher_append_activity',
      description: 'Append an entry to the DevLauncher activity feed (for the agent to log its own actions).',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string', description: 'Short human-readable message' }, detail: { type: 'string' } },
        required: ['message'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const message = requireString(args, 'message')
        const detail = typeof args.detail === 'string' ? args.detail : ''
        await d.storageManager.appendActivities([{
          type: 'agent', project: '', message: message.slice(0, 200), detail: detail.slice(0, 1000), timestamp: new Date().toISOString(),
        }])
        return { success: true }
      },
    },
  ]
}
