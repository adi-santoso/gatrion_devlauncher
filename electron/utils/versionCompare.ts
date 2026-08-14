/**
 * Minimal semver comparison for release versions like "1.10.2" or "v1.2.3".
 * Handles the common x.y.z[.patch] form; anything unrecognizable returns null
 * so callers can decide how to treat it (e.g. no update available).
 */

/**
 * @returns [major, minor, patch, build] or null when unparsable
 */
function parseVersion(version: unknown): number[] | null {
  const match = String(version ?? '')
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] || 0)]
}

/**
 * Compare two versions numerically: 1 when a > b, -1 when a < b, 0 when equal, null when unparsable.
 */
function compareVersions(a: unknown, b: unknown): 1 | -1 | 0 | null {
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
 */
function isVersionNewer(candidate: unknown, current: unknown): boolean {
  return compareVersions(candidate, current) === 1
}

export { parseVersion, compareVersions, isVersionNewer }

