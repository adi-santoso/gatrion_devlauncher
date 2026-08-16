/**
 * Manages the `devlauncher` entry in omp's user-level MCP config
 * (`~/.omp/agent/mcp.json`) — the file omp discovers in `--mode rpc` (verified
 * by the F0 spike). Merges without touching the user's other servers and
 * cleans up when the feature is disabled.
 */
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

const SERVER_NAME = 'devlauncher'

export function ompMcpConfigPath(): string {
  // Test hook: e2e points this at an isolated temp dir so the real
  // ~/.omp/agent/mcp.json is never touched (same pattern as DEVLAUNCHER_USER_DATA).
  if (process.env.DEVLAUNCHER_OMP_CONFIG_DIR) {
    return path.join(process.env.DEVLAUNCHER_OMP_CONFIG_DIR, 'mcp.json')
  }
  return path.join(os.homedir(), '.omp', 'agent', 'mcp.json')
}

export interface OmpMcpEntry {
  type: 'http'
  url: string
  headers: { Authorization: string }
  timeout: number
}

function readConfig(filePath: string): { mcpServers: Record<string, unknown> } {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.mcpServers && typeof parsed.mcpServers === 'object') {
      return { mcpServers: parsed.mcpServers as Record<string, unknown> }
    }
    if (parsed && typeof parsed === 'object') return { mcpServers: {} }
    return { mcpServers: {} }
  } catch {
    return { mcpServers: {} }
  }
}

function writeConfig(filePath: string, config: { mcpServers: Record<string, unknown> }): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n')
  fs.renameSync(tmp, filePath)
}

/** Write (or update) the devlauncher HTTP entry pointing at the local MCP server. */
export function writeOmpMcpEntry(port: number, token: string): string {
  const filePath = ompMcpConfigPath()
  const config = readConfig(filePath)
  const entry: OmpMcpEntry = {
    type: 'http',
    url: `http://127.0.0.1:${port}/mcp`,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
  }
  config.mcpServers[SERVER_NAME] = entry
  writeConfig(filePath, config)
  return filePath
}

/** Remove the devlauncher entry; if no servers remain, delete the file entirely. */
export function removeOmpMcpEntry(): void {
  const filePath = ompMcpConfigPath()
  if (!fs.existsSync(filePath)) return
  const config = readConfig(filePath)
  delete config.mcpServers[SERVER_NAME]
  if (Object.keys(config.mcpServers).length === 0) {
    try { fs.unlinkSync(filePath) } catch { /* best effort */ }
  } else {
    writeConfig(filePath, config)
  }
}
