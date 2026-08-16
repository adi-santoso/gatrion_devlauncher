/**
 * F2 write MCP tools — project lifecycle (start/stop/restart/presets), git and
 * npm operations. Every call is audited by the dispatcher (activity feed).
 */
import type { McpTool } from './toolsShared'
import { resolveProject, optionalInt, noop } from './toolsShared'
import { resolveLaunchConfig, topologicalSort } from '../handlers/processHandlers'
import { envVarsToObject } from '../projectSchema'
import { execNpm } from '../utils/npmRunner'
import * as git from './gitTools'

const projectIdSchema = { type: 'object', properties: { projectId: { type: 'string', description: 'DevLauncher project id' } }, required: ['projectId'] }

export function createWriteTools(): McpTool[] {
  return [
    // ── project lifecycle ────────────────────────────────────────────────────
    {
      name: 'devlauncher_start_project',
      description: 'Start a DevLauncher project (run its configured start command).',
      inputSchema: projectIdSchema,
      permission: 'write',
      handler: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        const launch = resolveLaunchConfig(project)
        return d.processManager.startProcess(
          project.id, project.path, launch.command, envVarsToObject(project.envVars), launch.port,
          noop, noop, noop, noop,
        )
      },
    },
    {
      name: 'devlauncher_stop_project',
      description: 'Stop a running DevLauncher project (graceful; force=true kills immediately).',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, force: { type: 'boolean', description: 'Kill immediately (default false)' } },
        required: ['projectId'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        return d.processManager.stopProcess(project.id, args.force === true)
      },
    },
    {
      name: 'devlauncher_restart_project',
      description: 'Restart a DevLauncher project.',
      inputSchema: projectIdSchema,
      permission: 'write',
      handler: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        const launch = resolveLaunchConfig(project)
        return d.processManager.restartProcess(
          project.id, project.path, launch.command, envVarsToObject(project.envVars), launch.port,
          noop, noop, noop, noop,
        )
      },
    },
    {
      name: 'devlauncher_start_all_projects',
      description: 'Start multiple projects (or all when projectIds omitted), respecting dependencies, with optional stagger delayMs.',
      inputSchema: {
        type: 'object',
        properties: {
          projectIds: { type: 'array', items: { type: 'string' }, description: 'Optional subset of project ids' },
          delayMs: { type: 'number', description: 'Stagger delay between starts (0-60000)', minimum: 0, maximum: 60000 },
        },
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const all = await d.storageManager.loadProjects()
        const requested = Array.isArray(args.projectIds) ? new Set(args.projectIds.filter((x): x is string => typeof x === 'string')) : null
        const projects = requested ? all.filter((p) => requested.has(p.id)) : all
        const sorted = topologicalSort(projects)
        const results: Array<{ projectId: string; success: boolean; error?: string }> = []
        const delayMs = optionalInt(args, 'delayMs', 0, 0, 60000)
        for (let index = 0; index < sorted.length; index++) {
          const project = sorted[index]
          try {
            const launch = resolveLaunchConfig(project)
            const result = await d.processManager.startProcess(
              project.id, project.path, launch.command, envVarsToObject(project.envVars), launch.port,
              noop, noop, noop, noop,
            )
            results.push({ projectId: project.id, ...result, success: result.success !== false })
          } catch (error) {
            results.push({ projectId: project.id, success: false, error: (error as Error).message })
          }
          if (delayMs > 0 && index < sorted.length - 1) await new Promise((r) => setTimeout(r, delayMs))
        }
        return { started: results.filter((r) => r.success).length, failed: results.filter((r) => !r.success).length, results }
      },
    },
    {
      name: 'devlauncher_stop_all_projects',
      description: 'Stop all running DevLauncher projects.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      permission: 'write',
      handler: async (_args, d) => d.processManager.stopAllProcesses(),
    },
    {
      name: 'devlauncher_apply_preset',
      description: 'Start every project in a saved workspace preset.',
      inputSchema: {
        type: 'object',
        properties: { presetId: { type: 'string', description: 'Preset id from devlauncher_get_presets' } },
        required: ['presetId'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const presetId = typeof args.presetId === 'string' && args.presetId.trim() ? args.presetId : (() => { throw new Error('presetId is required') })()
        const presets = await d.storageManager.loadPresets()
        const preset = presets.find((p) => p.id === presetId)
        if (!preset) throw new Error(`Preset ${presetId} not found`)
        const all = await d.storageManager.loadProjects()
        const ids = new Set<string>((preset.projectIds || []).filter((x): x is string => typeof x === 'string'))
        const results: Array<{ projectId: string; success: boolean; error?: string }> = []
        for (const project of all.filter((p) => ids.has(p.id))) {
          try {
            const launch = resolveLaunchConfig(project)
            const result = await d.processManager.startProcess(
              project.id, project.path, launch.command, envVarsToObject(project.envVars), launch.port,
              noop, noop, noop, noop,
            )
            results.push({ projectId: project.id, ...result, success: result.success !== false })
          } catch (error) {
            results.push({ projectId: project.id, success: false, error: (error as Error).message })
          }
        }
        return { preset: preset.name, started: results.filter((r) => r.success).length, results }
      },
    },

    // ── git ──────────────────────────────────────────────────────────────────
    {
      name: 'devlauncher_git_stage',
      description: 'Stage files in a project repo (omit files to stage all changes).',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } },
        required: ['projectId'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => { const p = await resolveProject(d, args.projectId); await git.gitStage(p.path, args.files); return { success: true } },
    },
    {
      name: 'devlauncher_git_unstage',
      description: 'Unstage files (omit files to reset the index).',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } },
        required: ['projectId'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => { const p = await resolveProject(d, args.projectId); await git.gitUnstage(p.path, args.files); return { success: true } },
    },
    {
      name: 'devlauncher_git_commit',
      description: 'Commit staged changes with a message.',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, message: { type: 'string', description: 'Commit message (max 2000 chars)' } },
        required: ['projectId', 'message'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const p = await resolveProject(d, args.projectId)
        const output = await git.gitCommit(p.path, args.message)
        return { success: true, output }
      },
    },
    {
      name: 'devlauncher_git_checkout',
      description: 'Checkout an existing branch, or create a new one (createNew=true).',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, branch: { type: 'string' }, createNew: { type: 'boolean' } },
        required: ['projectId', 'branch'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const p = await resolveProject(d, args.projectId)
        await git.gitCheckout(p.path, args.branch, args.createNew === true)
        return { success: true }
      },
    },
    {
      name: 'devlauncher_git_pull',
      description: 'git pull the project repo.',
      inputSchema: projectIdSchema,
      permission: 'write',
      handler: async (args, d) => { const p = await resolveProject(d, args.projectId); return { success: true, output: await git.gitPull(p.path) } },
    },
    {
      name: 'devlauncher_git_push',
      description: 'git push the project repo.',
      inputSchema: projectIdSchema,
      permission: 'write',
      handler: async (args, d) => { const p = await resolveProject(d, args.projectId); return { success: true, output: await git.gitPush(p.path) } },
    },
    {
      name: 'devlauncher_git_stash',
      description: 'git stash push with an optional message.',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, message: { type: 'string' } },
        required: ['projectId'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => { const p = await resolveProject(d, args.projectId); return { success: true, output: await git.gitStashPush(p.path, args.message) } },
    },
    {
      name: 'devlauncher_git_stash_pop',
      description: 'git stash pop (optionally a specific stash index).',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, index: { type: 'number' } },
        required: ['projectId'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => { const p = await resolveProject(d, args.projectId); return { success: true, output: await git.gitStashPop(p.path, optionalInt(args, 'index', 0, 0, 1000)) } },
    },
    {
      name: 'devlauncher_git_discard',
      description: 'Discard working-tree changes of one file (git checkout -- <file>).',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, file: { type: 'string' } },
        required: ['projectId', 'file'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => { const p = await resolveProject(d, args.projectId); await git.gitDiscard(p.path, args.file); return { success: true } },
    },

    // ── npm ──────────────────────────────────────────────────────────────────
    {
      name: 'devlauncher_npm_install',
      description: 'Install dependencies (npm install) of a project.',
      inputSchema: projectIdSchema,
      permission: 'write',
      handler: async (args, d) => {
        const p = await resolveProject(d, args.projectId)
        const output = await execNpm(p.path, ['install'])
        return { success: true, output: output.trim().slice(-2000) }
      },
    },
    {
      name: 'devlauncher_npm_update',
      description: 'Update one dependency (npm update <name>) of a project.',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, packageName: { type: 'string' } },
        required: ['projectId', 'packageName'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const p = await resolveProject(d, args.projectId)
        const name = typeof args.packageName === 'string' && args.packageName.trim() ? args.packageName : (() => { throw new Error('packageName is required') })()
        if (name.length > 200) throw new Error('packageName is too long')
        const output = await execNpm(p.path, ['update', name])
        return { success: true, output: output.trim().slice(-2000) }
      },
    },
    {
      name: 'devlauncher_run_project_script',
      description: 'Run an npm script (package.json scripts) of a project.',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, script: { type: 'string', description: 'Script name' } },
        required: ['projectId', 'script'],
        additionalProperties: false,
      },
      permission: 'write',
      handler: async (args, d) => {
        const p = await resolveProject(d, args.projectId)
        const script = typeof args.script === 'string' && args.script.trim() ? args.script : (() => { throw new Error('script is required') })()
        if (script.length > 100) throw new Error('script is too long')
        const output = await execNpm(p.path, ['run', script])
        return { success: true, output: output.trim().slice(-2000) }
      },
    },
  ]
}
