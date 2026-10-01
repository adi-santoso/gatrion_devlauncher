/**
 * Pure builders/parsers for remote commands. Keeping these free of ssh2 (and of
 * Electron) makes them unit-testable and keeps the transport thin.
 *
 * Every exec channel is a fresh shell: `cd`, variables, and activation
 * environments do NOT survive between commands, so `cwd` is always passed
 * explicitly and quoted here.
 */
import type { VpsService } from '../../../src/types/vps'

const SERVICE_NAME = /^[A-Za-z0-9_.@:-]{1,120}$/
// POSIX absolute path, no NUL/newline/backslash escapes that break quoting.
const CWD_PATTERN = /^\/[^\0\n\r"`$\\]{0,1024}$/

export function validateCwd(cwd: unknown): string {
  if (typeof cwd !== 'string' || !cwd.trim()) return ''
  const value = cwd.trim()
  if (!CWD_PATTERN.test(value)) throw new Error('Invalid working directory (must be an absolute POSIX path)')
  return value
}

export function validateServiceName(name: unknown): string {
  if (typeof name !== 'string' || !SERVICE_NAME.test(name.trim())) {
    throw new Error('Invalid service name')
  }
  return name.trim()
}

/** POSIX single-quote quoting — safe for arbitrary command text. */
export function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Build the remote command for `vps_exec`. `cwd` is prepended so the agent
 * gets the working directory it asked for without relying on channel state.
 */
export function buildExecCommand(command: string, cwd: string): string {
  if (typeof command !== 'string' || !command.trim()) throw new Error('command is required')
  if (command.length > 8000) throw new Error('command is too long (max 8000 chars)')
  if (command.includes('\0')) throw new Error('command contains a NUL byte')
  const dir = validateCwd(cwd)
  return dir ? `cd ${quoteShellArg(dir)} && ${command}` : command
}

/** One-shot overview probe. Sections are split by `___name___` markers. */
export function buildOverviewScript(): string {
  return [
    "echo ___os___; cat /etc/os-release 2>/dev/null",
    "echo ___kernel___; uname -r 2>/dev/null",
    "echo ___host___; hostname 2>/dev/null",
    "echo ___uptime___; cat /proc/uptime 2>/dev/null",
    "echo ___mem___; cat /proc/meminfo 2>/dev/null",
    "echo ___load___; cat /proc/loadavg 2>/dev/null",
    "echo ___stat___; head -n 1 /proc/stat 2>/dev/null",
    "echo ___disk___; df -P -k / 2>/dev/null",
    "echo ___cwd___; pwd 2>/dev/null",
    "echo ___end___",
  ].join('; ')
}

export interface OverviewSample {
  hostname: string | null
  os: string | null
  kernel: string | null
  uptimeSec: number | null
  memUsedMb: number | null
  memTotalMb: number | null
  loadAvg: [number, number, number] | null
  cpuTimes: { idle: number; total: number } | null
  diskUsedPercent: number | null
  cwd: string | null
}

/** Parse the output of `buildOverviewScript()` into structured fields. */
export function parseOverview(raw: string): OverviewSample {
  const sections = new Map<string, string>()
  let current: string | null = null
  const lines: string[] = []
  const flush = (): void => {
    if (current) sections.set(current, lines.join('\n').trim())
    lines.length = 0
  }
  for (const line of raw.split(/\r?\n/)) {
    const marker = /^___([a-z]+)___$/.exec(line.trim())
    if (marker) {
      flush()
      current = marker[1]
      continue
    }
    if (current) lines.push(line)
  }
  flush()

  const osRelease = sections.get('os') || ''
  const pretty = /^PRETTY_NAME="?([^"\n]+)"?$/m.exec(osRelease)
  const name = /^NAME="?([^"\n]+)"?$/m.exec(osRelease)
  const version = /^VERSION="?([^"\n]+)"?$/m.exec(osRelease)
  const os = pretty ? pretty[1].trim() : name ? `${name[1].trim()}${version ? ` ${version[1].trim()}` : ''}` : null

  const uptimeRaw = parseFloat((sections.get('uptime') || '').split(/\s+/)[0] || '')
  const loadParts = (sections.get('load') || '').trim().split(/\s+/).map(Number)

  const meminfo = sections.get('mem') || ''
  const memTotalKb = Number(/^MemTotal:\s+(\d+)/m.exec(meminfo)?.[1] || 0)
  const memAvailableKb = Number(/^MemAvailable:\s+(\d+)/m.exec(meminfo)?.[1] || 0)
  const memTotalMb = memTotalKb > 0 ? Math.round(memTotalKb / 1024) : null
  const memUsedMb = memTotalKb > 0 ? Math.round((memTotalKb - memAvailableKb) / 1024) : null

  const diskLine = (sections.get('disk') || '').split(/\r?\n/)[1] || ''
  const diskCols = diskLine.trim().split(/\s+/)
  const diskUsedPercent = diskCols.length >= 5 ? Number(diskCols[4].replace('%', '')) : NaN

  return {
    hostname: sections.get('host') || null,
    os,
    kernel: sections.get('kernel') || null,
    uptimeSec: Number.isFinite(uptimeRaw) ? Math.floor(uptimeRaw) : null,
    memUsedMb,
    memTotalMb,
    loadAvg:
      loadParts.length >= 3 && loadParts.slice(0, 3).every((n) => Number.isFinite(n))
        ? [loadParts[0], loadParts[1], loadParts[2]]
        : null,
    cpuTimes: parseCpuTimes(sections.get('stat') || ''),
    diskUsedPercent: Number.isFinite(diskUsedPercent) ? diskUsedPercent : null,
    cwd: sections.get('cwd') || null,
  }
}

/** Parse the aggregate `cpu` line of /proc/stat into cumulative jiffies. */
export function parseCpuTimes(line: string): { idle: number; total: number } | null {
  const parts = line.trim().split(/\s+/)
  if (parts[0] !== 'cpu' || parts.length < 5) return null
  const values = parts.slice(1).map(Number)
  if (values.some((v) => !Number.isFinite(v))) return null
  const [user, nice, system, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = values
  const total = user + nice + system + idle + iowait + irq + softirq + steal
  return { idle: idle + iowait, total }
}

/** CPU percent between two cumulative samples; null when not enough data. */
export function cpuPercentBetween(
  prev: { idle: number; total: number } | null,
  next: { idle: number; total: number } | null,
): number | null {
  if (!prev || !next) return null
  const totalDelta = next.total - prev.total
  const idleDelta = next.idle - prev.idle
  if (totalDelta <= 0 || idleDelta < 0) return null
  const used = ((totalDelta - idleDelta) / totalDelta) * 100
  return Math.max(0, Math.min(100, Math.round(used * 10) / 10))
}

/** systemd unit listing probe (Linux + systemd target only, per D7). */
export function buildServicesCommand(): string {
  return "systemctl list-units --type=service --all --no-pager --no-legend --plain 2>/dev/null || systemctl list-units --type=service --no-pager --no-legend 2>/dev/null"
}

/** Parse `systemctl list-units` output into service records. */
export function parseServices(raw: string): VpsService[] {
  const services: VpsService[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^[●*]\s*/, '')
    if (!trimmed || !trimmed.includes('.service')) continue
    const cols = trimmed.split(/\s+/)
    const name = cols[0]
    if (!name.endsWith('.service')) continue
    // Columns: UNIT LOAD ACTIVE SUB DESCRIPTION...
    const description = cols.slice(4).join(' ')
    services.push({
      name,
      load: cols[1] || '',
      active: cols[2] || '',
      sub: cols[3] || '',
      description: description.slice(0, 200),
    })
  }
  // De-duplicate by unit name, keeping the first occurrence.
  const seen = new Set<string>()
  return services.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)))
}

/** `journalctl` tail for one unit. Fails clearly when journal access is denied. */
export function buildLogsCommand(service: string, lines: number): string {
  const unit = validateServiceName(service)
  const count = Math.max(1, Math.min(2000, Math.floor(lines) || 200))
  return `journalctl -u ${quoteShellArg(unit)} -n ${count} --no-pager -o short-iso 2>&1`
}

/** `systemctl restart` for one validated unit. */
export function buildRestartCommand(service: string): string {
  const unit = validateServiceName(service)
  return `systemctl restart ${quoteShellArg(unit)} 2>&1; result=$?; echo "exit:$result"; if [ "$result" -ne 0 ]; then exit "$result"; fi; systemctl is-active ${quoteShellArg(unit)} 2>&1`
}

/**
 * Classify the exit status of `vps_restart_service`. `systemctl restart` can
 * print "Failed to restart" while still exiting 0 in some shells, so we also
 * check the echoed marker.
 */
export function parseRestartResult(output: string, exitCode: number | null): { ok: boolean; detail: string } {
  const marker = /exit:(\d+)/.exec(output)
  const code = marker ? Number(marker[1]) : exitCode
  const failed = /Failed to (restart|start)|not found|Access denied|Interactive authentication required/i.test(output)
  return { ok: !failed && code === 0, detail: failed ? output.trim().slice(0, 300) : 'restarted' }
}
