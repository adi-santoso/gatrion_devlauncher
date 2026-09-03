import { describe, test, expect } from 'vitest'
import { previewUrl } from '../previewUrl'

describe('previewUrl', () => {
  test('defaults to localhost when host is absent or empty', () => {
    expect(previewUrl(3000)).toBe('http://localhost:3000')
    expect(previewUrl(3000, undefined)).toBe('http://localhost:3000')
    expect(previewUrl(3000, null)).toBe('http://localhost:3000')
    expect(previewUrl(3000, '')).toBe('http://localhost:3000')
  })

  test('uses 127.0.0.1 when selected', () => {
    expect(previewUrl(3000, '127.0.0.1')).toBe('http://127.0.0.1:3000')
  })

  test('coerces unknown hosts to localhost', () => {
    expect(previewUrl(3000, 'example.com')).toBe('http://localhost:3000')
    expect(previewUrl(3000, 123)).toBe('http://localhost:3000')
  })

  test('returns null for missing/invalid ports', () => {
    expect(previewUrl(null)).toBeNull()
    expect(previewUrl(undefined)).toBeNull()
    expect(previewUrl('')).toBeNull()
    expect(previewUrl('abc')).toBeNull()
    expect(previewUrl('5173')).toBe('http://localhost:5173')
  })
})
