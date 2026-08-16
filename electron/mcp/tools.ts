/**
 * MCP tool registry barrel — assembles the F1 read tools and the F2 write
 * tools into one list. Shared types/helpers/dispatch live in toolsShared.ts;
 * definitions are split by concern to stay under the 400-line rule:
 *   - toolsRead.ts      — read-only observation tools
 *   - toolsWrite.ts     — project lifecycle, presets, git, npm
 *   - toolsWriteMisc.ts — terminal, preview, env, config, activity
 */
import type { McpTool } from './toolsShared'
import { createReadTools } from './toolsRead'
import { createWriteTools } from './toolsWrite'
import { createWriteMiscTools } from './toolsWriteMisc'
import { createDestructiveTools } from './toolsDestructive'

export type { McpDeps, McpTool, Permission } from './toolsShared'
export { dispatchTool } from './toolsShared'

export function createTools(): McpTool[] {
  return [
    ...createReadTools(),
    ...createWriteTools(),
    ...createWriteMiscTools(),
    ...createDestructiveTools(),
  ]
}
