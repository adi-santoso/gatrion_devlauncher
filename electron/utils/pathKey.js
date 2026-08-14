// @ts-check
const path = require('path')

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
 * @param {string} [projectPath]
 * @param {boolean} [caseInsensitive] - default: process.platform === 'win32'
 */
function normalizePathKey(projectPath, caseInsensitive = process.platform === 'win32') {
  if (!projectPath) return ''
  const normalized = path.normalize(projectPath).replace(/[/\\]+$/, '')
  return caseInsensitive ? normalized.toLowerCase() : normalized
}

module.exports = { normalizePathKey }
