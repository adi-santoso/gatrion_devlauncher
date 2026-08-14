// @ts-check
/**
 * Minimal semver comparison for release versions like "1.10.2" or "v1.2.3".
 * Handles the common x.y.z[.patch] form; anything unrecognizable returns null
 * so callers can decide how to treat it (e.g. no update available).
 */

/**
 * @param {unknown} version
 * @returns {number[] | null} [major, minor, patch, build] or null when unparsable
 */
function parseVersion(version) {
  const match = String(version ?? '')
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] || 0)]
}

/**
 * Compare two versions numerically.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {1 | -1 | 0 | null} 1 when a > b, -1 when a < b, 0 when equal, null when unparsable
 */
function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return null
  for (let index = 0; index < 4; index++) {
    if (pa[index] !== pb[index]) return pa[index] > pb[index] ? 1 : -1
  }
  return 0
}

/**
 * True when `candidate` is a strictly newer release than `current`.
 * Unlike a naive `!==` string check this is safe against version 1.0.10
 * vs 1.0.9 and never flags an older release as an available update.
 * @param {unknown} candidate
 * @param {unknown} current
 */
function isVersionNewer(candidate, current) {
  return compareVersions(candidate, current) === 1
}

module.exports = { parseVersion, compareVersions, isVersionNewer }
