const path = require('path')
const fs = require('fs')

/** Resolve existing aliases (including Windows junctions) before storing identity. */
function canonicalProjectPath(projectPath: string): string {
  const absolute = path.resolve(projectPath.trim())
  try { return fs.realpathSync.native(absolute) } catch { return absolute }
}

/**
 * Build a comparison key for a project path used in duplicate detection.
 *
 * Windows paths are case-insensitive, so the key is lowercased there. On
 * macOS/Linux (where filesystems are case-sensitive — or may be, depending on
 * APFS configuration) the path is kept as-is: two projects whose only
 * difference is letter case point at genuinely different directories.
 *
 * Trailing slashes are stripped so `C:/projects/app` and `C:/projects/app/`
 * collide on every platform.
 *
 */
function normalizePathKey(projectPath: string | null | undefined, caseInsensitive = process.platform === 'win32'): string {
  if (!projectPath) return ''
  const normalized = canonicalProjectPath(projectPath).replace(/[/\\]+$/, '')
  return caseInsensitive ? normalized.toLowerCase() : normalized
}

export { normalizePathKey, canonicalProjectPath }
