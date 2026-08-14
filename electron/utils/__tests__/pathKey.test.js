import { describe, test, expect } from 'vitest'
import path from 'node:path'
import { normalizePathKey } from '../pathKey'

// Expected values must go through path.normalize too, since Windows and
// POSIX normalize to their own native separators.
const norm = (p) => path.normalize(p)

describe('normalizePathKey', () => {
  test('strips trailing slashes on every platform', () => {
    expect(normalizePathKey('C:/projects/app/', true)).toBe(norm('c:/projects/app'))
    expect(normalizePathKey('C:/projects/app/', false)).toBe(norm('C:/projects/app'))
  })

  test('lowercases only on case-insensitive platforms (win32)', () => {
    expect(normalizePathKey('C:/Projects/App', true)).toBe(norm('c:/projects/app'))
    expect(normalizePathKey('/home/User/App', true)).toBe(norm('/home/user/app'))
    // Case-sensitive (macOS/Linux): the casing is preserved so genuinely
    // different directories are not treated as duplicates.
    expect(normalizePathKey('/home/User/App', false)).toBe(norm('/home/User/App'))
    expect(normalizePathKey('/home/user/app', false)).toBe(norm('/home/user/app'))
  })

  test('normalizes separators and dot segments through path.normalize', () => {
    expect(normalizePathKey('C:/projects/../projects/app', true)).toBe(norm('c:/projects/app'))
  })

  test('empty and falsy inputs yield an empty key', () => {
    expect(normalizePathKey('')).toBe('')
    expect(normalizePathKey(null)).toBe('')
    expect(normalizePathKey(undefined)).toBe('')
  })
})
