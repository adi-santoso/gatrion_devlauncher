import { describe, test, expect } from 'vitest'
import { parseVersion, compareVersions, isVersionNewer } from '../versionCompare'

describe('parseVersion', () => {
  test('parses x.y.z, v-prefixed, and padded forms', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3, 0])
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3, 0])
    expect(parseVersion(' 2.0.0 ')).toEqual([2, 0, 0, 0])
    expect(parseVersion('1.2.3.4')).toEqual([1, 2, 3, 4])
    expect(parseVersion('V10.0.1')).toEqual([10, 0, 1, 0])
  })

  test('rejects unparsable input', () => {
    expect(parseVersion('abc')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion(null)).toBeNull()
    expect(parseVersion(undefined)).toBeNull()
    expect(parseVersion('1.2')).toBeNull()
  })
})

describe('isVersionNewer', () => {
  test('numeric comparison beats lexical string compare (1.0.10 vs 1.0.9)', () => {
    // '1.0.10' < '1.0.9' as strings, but 1.0.10 IS newer numerically.
    expect(isVersionNewer('1.0.10', '1.0.9')).toBe(true)
  })

  test('equal versions are never newer', () => {
    expect(isVersionNewer('1.2.3', '1.2.3')).toBe(false)
    expect(isVersionNewer('v1.2.3', '1.2.3')).toBe(false)
  })

  test('older releases are never advertised as updates', () => {
    expect(isVersionNewer('1.0.9', '1.0.10')).toBe(false)
    expect(isVersionNewer('2.0.0', '2.1.0')).toBe(false)
  })

  test('major/minor/patch upgrades are newer', () => {
    expect(isVersionNewer('2.0.0', '1.9.9')).toBe(true)
    expect(isVersionNewer('1.2.0', '1.1.9')).toBe(true)
    expect(isVersionNewer('1.2.3', '1.2.2')).toBe(true)
    expect(isVersionNewer('1.2.3.1', '1.2.3.0')).toBe(true)
  })

  test('unparsable versions never count as newer', () => {
    expect(isVersionNewer('latest', '1.0.0')).toBe(false)
    expect(isVersionNewer('1.0.0', 'garbage')).toBe(false)
  })
})

describe('compareVersions', () => {
  test('returns -1 / 0 / 1 / null', () => {
    expect(compareVersions('1.2.3', '1.2.2')).toBe(1)
    expect(compareVersions('1.2.2', '1.2.3')).toBe(-1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('x', '1.2.3')).toBeNull()
  })
})
