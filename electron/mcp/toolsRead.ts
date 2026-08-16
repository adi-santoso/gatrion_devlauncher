/**
 * F1 read-only MCP tools — let the agent observe the DevLauncher workspace
 * without changing anything. All handlers go through existing managers.
 */
import type { McpTool } from './toolsShared'
import { safeProject, resolveProject, optionalInt } from './toolsShared'
import * as git from './gitTools'

const projectIdSchema = { type: 'object', properties: { projectId: { type: 'string', description: 'DevLauncher project id' } }, required: ['projectId'] }

export function createReadTools(): McpTool[] {
  return [
    {
      name: 'devlauncher_list_projects',
      description: 'List all DevLauncher projects with runtime status (running/stopped/error), framework type, port and tags.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      permission: 'read',
      handler: async (_args, d) => {
        const projects = await d.storageManager.loadProjects()
        return projects.map((p) => safeProject(p, d.processManager.getProcessStatus(p.id)))
      },
    },
    {
      name: 'devlauncher_get_project',
      description: 'Get one DevLauncher project: metadata, runtime status, health summary (runs/crashes/uptime).',
      inputSchema: projectIdSchema,
      permission: 'read',
      handler: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        const status = d.processManager.getProcessStatus(project.id)
        const health = d.healthManager.getStats(project.id)
        return {
          project: safeProject(project, status),
          health: health ? { totalRuns: health.totalRuns ?? 0, totalUptimeMs: health.totalUptimeMs ?? 0, crashes: health.crashes?.length ?? 0 } : null,
        }
      },
    },
    {
      name: 'devlauncher_get_project_logs',
      description: 'Tail the runtime log of a DevLauncher project (max 500 lines, newest last).',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          limit: { type: 'number', description: 'Max lines (1-500)', minimum: 1, maximum: 500 },
        },
        required: ['projectId'],
        additionalProperties: false,
      },
      permission: 'read',
      handler: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        const limit = optionalInt(args, 'limit', 100, 1, 500)
        return d.processManager.getLogs(project.id, limit)
      },
    },
    {
      name: 'devlauncher_git_status',
      description: 'Git status of a DevLauncher project: branch, ahead/behind, staged, unstaged, untracked files.',
      inputSchema: projectIdSchema,
      permission: 'read',
      handler: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        return git.gitStatus(project.path)
      },
    },
    {
      name: 'devlauncher_get_app_config',
      description: 'Read the DevLauncher app config: theme, language, notifications, terminal, auto-restart, preview, agent settings.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      permission: 'read',
      handler: async (_args, d) => {
        const config = await d.storageManager.loadConfig()
        const { windowBounds: _wb, schemaVersion: _sv, ...safe } = config as unknown as Record<string, unknown>
        return safe
      },
    },
    {
      name: 'devlauncher_get_presets',
      description: 'List workspace presets (named groups of projects that can be started together).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      permission: 'read',
      handler: async (_args, d) => d.storageManager.loadPresets(),
    },
    {
      name: 'devlauncher_get_health',
      description: 'Health analytics for a project: run history, crashes, uptime, daily CPU/memory trend.',
      inputSchema: projectIdSchema,
      permission: 'read',
      handler: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        return d.healthManager.getStats(project.id)
      },
    },
    {
      name: 'devlauncher_preview_read_console',
      description: 'Read recent console messages (errors/warnings/logs) from the embedded preview of a project.',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, limit: { type: 'number' } },
        required: ['projectId'],
        additionalProperties: false,
      },
      permission: 'read',
      handler: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        const limit = optionalInt(args, 'limit', 50, 1, 500)
        return d.previewManager.getConsoleBuffer(project.id, limit)
      },
    },
  ]
}
