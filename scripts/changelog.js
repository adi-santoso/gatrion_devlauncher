#!/usr/bin/env node
// @ts-check
/**
 * Changelog generator — builds a Keep-a-Changelog section from conventional
 * commits and (optionally) inserts it into CHANGELOG.md.
 *
 * Usage:
 *   node scripts/changelog.js                 # print the new section (dry run)
 *   node scripts/changelog.js --apply         # insert into CHANGELOG.md
 *   node scripts/changelog.js --from v1.2.0   # commits since that tag/ref
 *   node scripts/changelog.js --version 1.3.0 # heading version (default Unreleased)
 *   node scripts/changelog.js --since 30      # last 30 commits (when no tag exists)
 *
 * With no --from, the script uses the newest version tag if one exists,
 * otherwise it falls back to the last 100 commits.
 */
const fs = require('fs')
const path = require('path')
const { parseCommit, groupCommits, renderSection, insertSection, runGit } = require('./changelogLib')

const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md')
const DEFAULT_LIMIT = 100

function parseArgs(argv) {
  const options = { apply: false, from: null, version: null, since: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') options.apply = true
    else if (arg === '--from') options.from = argv[++i]
    else if (arg === '--version') options.version = argv[++i]
    else if (arg === '--since') options.since = Number(argv[++i])
  }
  return options
}

function resolveFrom(options) {
  if (options.from) return options.from
  // Newest tag, if any.
  const tags = runGit(['tag', '--sort=-version:refname']).split('\n').filter(Boolean)
  return tags[0] || null
}

function loadCommits(from, limit) {
  const args = ['log', '--pretty=format:%s%x1f%h', from ? `${from}..HEAD` : '-n', String(limit)]
  const output = runGit(args)
  if (!output) return []
  return output.split('\n').map((line) => {
    const [subject, hash] = line.split('\x1f')
    return { hash, ...parseCommit(subject) }
  })
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const from = resolveFrom(options)
  const limit = Number.isFinite(options.since) && options.since > 0 ? options.since : DEFAULT_LIMIT
  const commits = loadCommits(from, limit)
  const grouped = groupCommits(commits)
  const section = renderSection({
    version: options.version || undefined,
    date: new Date().toISOString().slice(0, 10),
    groups: grouped,
  })

  if (!options.apply) {
    process.stdout.write(`${section}\n`)
    return
  }

  const current = fs.readFileSync(CHANGELOG_PATH, 'utf8')
  fs.writeFileSync(CHANGELOG_PATH, insertSection(current, section), 'utf8')
  process.stdout.write(`Inserted ${commits.length} commit(s) into ${path.relative(process.cwd(), CHANGELOG_PATH)}\n`)
}

main()
