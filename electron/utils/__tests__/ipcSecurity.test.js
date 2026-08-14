import { describe, test, expect } from 'vitest'
import path from 'path'
import { pathToFileURL } from 'url'
import { isTrustedSenderUrl, getPackagedIndexUrl } from '../ipcSecurity'

const packagedUrl = getPackagedIndexUrl()

describe('isTrustedSenderUrl', () => {
  test('accepts the dev server URL when unpackaged', () => {
    expect(isTrustedSenderUrl('http://localhost:5173/index.html', { isPackaged: false, packagedUrl })).toBe(true)
    expect(isTrustedSenderUrl('http://localhost:5173/', { isPackaged: false, packagedUrl })).toBe(true)
  })

  test('rejects foreign origins in dev mode', () => {
    expect(isTrustedSenderUrl('https://evil.example.com/', { isPackaged: false, packagedUrl })).toBe(false)
    expect(isTrustedSenderUrl('http://localhost:9999/', { isPackaged: false, packagedUrl })).toBe(false)
    expect(isTrustedSenderUrl('file:///C:/Windows/System32/cmd.exe', { isPackaged: false, packagedUrl })).toBe(false)
  })

  test('accepts only the packaged index.html when packaged', () => {
    expect(isTrustedSenderUrl(packagedUrl, { isPackaged: true, packagedUrl })).toBe(true)
    expect(isTrustedSenderUrl('https://evil.example.com/', { isPackaged: true, packagedUrl })).toBe(false)
    expect(isTrustedSenderUrl('http://localhost:5173/', { isPackaged: true, packagedUrl })).toBe(false)
  })

  test('rejects missing or empty sender URLs', () => {
    expect(isTrustedSenderUrl(null, { isPackaged: false, packagedUrl })).toBe(false)
    expect(isTrustedSenderUrl(undefined, { isPackaged: false, packagedUrl })).toBe(false)
    expect(isTrustedSenderUrl('', { isPackaged: false, packagedUrl })).toBe(false)
  })

  test('getPackagedIndexUrl points at the built renderer', () => {
    const expected = pathToFileURL(path.resolve(process.cwd(), 'dist-react/index.html')).href
    expect(packagedUrl).toBe(expected)
    expect(packagedUrl).toContain('dist-react/index.html')
    expect(packagedUrl.startsWith('file://')).toBe(true)
  })
})
