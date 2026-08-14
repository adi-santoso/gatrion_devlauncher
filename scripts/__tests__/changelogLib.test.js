import { describe, test, expect } from 'vitest'
import { parseCommit, groupCommits, renderSection, insertSection } from '../changelogLib'

describe('parseCommit', () => {
  test('parses type, scope, breaking and subject', () => {
    expect(parseCommit('feat(p2): workspace backup bundle')).toEqual({
      type: 'feat',
      scope: 'p2',
      breaking: false,
      subject: 'workspace backup bundle',
    })
    expect(parseCommit('fix!: drop the old API')).toEqual({
      type: 'fix',
      scope: null,
      breaking: true,
      subject: 'drop the old API',
    })
    expect(parseCommit('test: add unit tests')).toEqual({
      type: 'test',
      scope: null,
      breaking: false,
      subject: 'add unit tests',
    })
  })

  test('falls back to "other" for non-conventional subjects', () => {
    expect(parseCommit('just a random message').type).toBe('other')
    expect(parseCommit('').type).toBe('other')
  })
})

describe('groupCommits', () => {
  test('maps conventional types to Keep-a-Changelog sections', () => {
    const groups = groupCommits([
      { ...parseCommit('feat: new feature'), breaking: false },
      { ...parseCommit('fix: bug fix') },
      { ...parseCommit('chore: housekeeping') },
      { ...parseCommit('docs: readme') },
      { ...parseCommit('test: coverage') },
      { ...parseCommit('security: patch') },
    ])
    expect(groups.Added).toEqual(['new feature'])
    expect(groups.Fixed).toEqual(['bug fix'])
    expect(groups.Changed).toEqual(['housekeeping'])
    expect(groups.Docs).toEqual(['readme'])
    expect(groups.Tests).toEqual(['coverage'])
    expect(groups.Security).toEqual(['patch'])
  })

  test('marks breaking commits and scopes', () => {
    const groups = groupCommits([parseCommit('refactor(p1)!: rewrite validation')])
    expect(groups.Changed).toEqual(['⚠️ **BREAKING**: **p1:** rewrite validation'])
  })
})

describe('renderSection', () => {
  test('renders a Keep-a-Changelog section in canonical order', () => {
    const section = renderSection({
      version: '1.4.0',
      date: '2026-08-14',
      groups: {
        Fixed: ['crash on exit'],
        Added: ['new theme', 'shortcut'],
      },
    })
    expect(section).toContain('## [1.4.0] - 2026-08-14')
    expect(section.indexOf('### Added')).toBeLessThan(section.indexOf('### Fixed'))
    expect(section).toContain('- new theme')
    expect(section).toContain('- crash on exit')
  })

  test('renders an empty notice when nothing changed', () => {
    expect(renderSection({ groups: {} })).toContain('_No changes recorded._')
  })
})

describe('insertSection', () => {
  const sample = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '- old entry',
    '',
  ].join('\n')

  test('inserts before an existing Unreleased heading', () => {
    const section = '## [1.4.0] - 2026-08-14\n\n### Added\n- new stuff'
    const next = insertSection(sample, section)
    expect(next.indexOf('## [1.4.0]')).toBeLessThan(next.indexOf('## [Unreleased]'))
    expect(next).toContain('- old entry')
    expect(next).toContain('- new stuff')
  })

  test('inserts after the header when no Unreleased heading exists', () => {
    const noUnreleased = '# Changelog\n\nIntro text.\n\n### Added\n- old\n'
    const next = insertSection(noUnreleased, '## [1.4.0] - 2026-08-14\n\n### Added\n- new')
    expect(next.indexOf('## [1.4.0]')).toBeLessThan(next.indexOf('- old'))
    expect(next.startsWith('# Changelog')).toBe(true)
  })
})
