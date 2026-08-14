// @ts-check
/**
 * Pure helpers for the changelog generator (scripts/changelog.js).
 * Split from the CLI wrapper so the parsing/grouping/rendering logic can be
 * unit-tested without spawning git.
 *
 * Commit format follows Conventional Commits:
 *   type(scope)!: subject
 *   type: subject
 * Body may contain "BREAKING CHANGE:" markers.
 */

const TYPE_SECTIONS = {
  feat: 'Added',
  fix: 'Fixed',
  chore: 'Changed',
  refactor: 'Changed',
  perf: 'Changed',
  style: 'Changed',
  build: 'Changed',
  ci: 'Changed',
  docs: 'Docs',
  test: 'Tests',
  security: 'Security',
  revert: 'Removed',
  remove: 'Removed',
}

const UNKNOWN_SECTION = 'Changed'

/**
 * Parse one conventional commit subject into structured parts.
 * @param {string} subject
 * @returns {{ type: string, scope: string|null, breaking: boolean, subject: string }}
 */
function parseCommit(subject) {
  const text = String(subject || '').trim()
  const match = text.match(/^([a-zA-Z]+)(?:\(([^)]+)\))?(!)?:\s*(.*)$/)
  if (!match) {
    return { type: 'other', scope: null, breaking: false, subject: text }
  }
  const [, type, scope, bang, rest] = match
  return {
    type: type.toLowerCase(),
    scope: scope || null,
    breaking: Boolean(bang),
    subject: rest.trim(),
  }
}

/**
 * Group parsed commits into Keep-a-Changelog sections, newest first.
 * @param {Array<{ type: string, scope: string|null, breaking: boolean, subject: string }>} commits
 * @returns {Record<string, Array<string>>}
 */
function groupCommits(commits) {
  const groups = {}
  for (const commit of commits) {
    const section = TYPE_SECTIONS[commit.type] || UNKNOWN_SECTION
    const prefix = commit.breaking ? '⚠️ **BREAKING**: ' : ''
    const scope = commit.scope ? `**${commit.scope}:** ` : ''
    const line = `${prefix}${scope}${commit.subject}`
    if (!groups[section]) groups[section] = []
    groups[section].push(line)
  }
  return groups
}

const SECTION_ORDER = ['Added', 'Changed', 'Fixed', 'Removed', 'Security', 'Docs', 'Tests']

/**
 * Render a Keep-a-Changelog section from grouped commits.
 * @param {{ version?: string, date?: string, groups: Record<string, Array<string>> }} input
 */
function renderSection({ version, date, groups }) {
  const heading = `## [${version || 'Unreleased'}]${date ? ` - ${date}` : ''}`
  const parts = [heading]
  for (const section of SECTION_ORDER) {
    const lines = groups[section]
    if (lines && lines.length > 0) {
      parts.push(`### ${section}`)
      for (const line of lines) parts.push(`- ${line}`)
    }
  }
  if (parts.length === 1) parts.push('_No changes recorded._')
  return parts.join('\n')
}

/**
 * Insert a generated section into CHANGELOG.md, right before an existing
 * "## [Unreleased]" heading (or at the top of the body otherwise).
 * @param {string} changelogText
 * @param {string} section
 * @returns {string} new full file content
 */
function insertSection(changelogText, section) {
  const lines = (changelogText || '').split('\n')
  const unreleasedIndex = lines.findIndex((line) => /^##\s+\[Unreleased\]/.test(line))
  if (unreleasedIndex === -1) {
    // No Unreleased heading: insert after the document header (first blank
    // line that follows the title/intro block).
    const firstHeading = lines.findIndex((line) => /^#\s/.test(line))
    const insertAt = firstHeading === -1 ? 0 : firstHeading + 1
    lines.splice(insertAt, 0, '', section)
    return lines.join('\n').replace(/\n{3,}/g, '\n\n')
  }
  lines.splice(unreleasedIndex, 0, section, '')
  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * Run a git command and return trimmed stdout (throws on failure).
 * @param {string[]} args
 */
function runGit(args) {
  const { execFileSync } = require('child_process')
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim()
}

module.exports = { parseCommit, groupCommits, renderSection, insertSection, runGit, TYPE_SECTIONS, SECTION_ORDER }
