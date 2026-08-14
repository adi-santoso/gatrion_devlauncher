// @ts-check
const fs = require('fs').promises

/**
 * Rotate a JSON-lines log file once it exceeds `maxSize` bytes: the current
 * file is moved aside and the newest `maxLines` lines are kept as the new
 * active file, so context from right before the rotation is not lost.
 *
 * Pure function (no module state) so the rotation behavior is unit-testable.
 *
 * @param {string} filePath - active log file
 * @param {{ maxSize?: number, maxLines?: number }} [options]
 * @returns {Promise<boolean>} true when a rotation happened
 */
async function rotateLogFile(filePath, { maxSize = 10 * 1024 * 1024, maxLines = 1000 } = {}) {
  const stats = await fs.stat(filePath).catch(() => null)
  if (!stats || stats.size < maxSize) return false

  const backupPath = `${filePath}.old`
  await fs.rename(filePath, backupPath)

  try {
    const content = await fs.readFile(backupPath, 'utf8')
    const lines = content.split('\n')
    const truncated = lines.slice(-maxLines).join('\n')
    await fs.writeFile(filePath, truncated, 'utf8')
  } finally {
    await fs.unlink(backupPath).catch(() => {})
  }
  return true
}

module.exports = { rotateLogFile }
