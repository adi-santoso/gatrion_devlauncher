import { describe, test, expect } from 'vitest'

import { parseComposerOutdated, parseGoOutdated, parsePipOutdated, parseCargoOutdated } from '../dependencyHandlers'

describe('parseComposerOutdated', () => {
  test('parses composer outdated --json and keeps only packages with a newer latest', () => {
    const raw = JSON.stringify({ installed: {
      'laravel/framework': { current: '11.0.0', wanted: '11.5.0', latest: '11.5.0' },
      'monolog/monolog': { current: '3.0.0', wanted: '3.0.0', latest: '3.0.0' },
    }})
    const result = parseComposerOutdated(raw)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('laravel/framework')
    expect(result[0].latest).toBe('11.5.0')
  })

  test('returns [] for invalid JSON', () => {
    expect(parseComposerOutdated('not json')).toEqual([])
  })
})

describe('parseGoOutdated', () => {
  test('parses whitespace-separated JSON objects and keeps upgradable modules', () => {
    const raw = [
      JSON.stringify({ Path: 'github.com/user/mod-a', Version: 'v1.0.0', Update: { Version: 'v1.2.0' } }),
      JSON.stringify({ Path: 'github.com/user/mod-b', Version: 'v1.0.0' }),
      JSON.stringify({ Path: 'github.com/user/mod-c', Version: 'v2.0.0', Update: { Version: 'v2.0.0' } }),
    ].join('\n')
    const result = parseGoOutdated(raw)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('github.com/user/mod-a')
    expect(result[0].latest).toBe('v1.2.0')
  })

  test('sorts by name and returns [] for no updates', () => {
    const result = parseGoOutdated('')
    expect(result).toEqual([])
  })
})

describe('parsePipOutdated', () => {
  test('parses pip list --outdated json', () => {
    const raw = JSON.stringify([
      { name: 'requests', version: '2.0.0', latest_version: '2.31.0' },
      { name: 'flask', version: '3.0.0', latest_version: '3.0.0' },
    ])
    const result = parsePipOutdated(raw)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('requests')
    expect(result[0].latest).toBe('2.31.0')
  })

  test('returns [] for invalid JSON', () => {
    expect(parsePipOutdated('nope')).toEqual([])
  })
})

describe('parseCargoOutdated', () => {
  test('parses cargo outdated --format=json and keeps outdated deps', () => {
    const raw = JSON.stringify({ dependencies: [
      { name: 'serde', project: [{ name: 'serde', version: '1.0.0', latest: '1.0.200' }] },
      { name: 'tokio', project: [{ name: 'tokio', version: '1.0.0', latest: '1.0.0' }] },
    ]})
    const result = parseCargoOutdated(raw)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('serde')
    expect(result[0].latest).toBe('1.0.200')
  })

  test('returns [] for invalid JSON', () => {
    expect(parseCargoOutdated('###')).toEqual([])
  })
})