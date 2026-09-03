import { describe, test, expect, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { app, __reset } = createRequire(import.meta.url)('electron')

import CredentialManager from '../../managers/CredentialManager'

let tempRoot

beforeEach(() => {
  __reset()
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'credential-manager-'))
  app._userDataPath = tempRoot
})

describe('CredentialManager', () => {
  test('returns empty array for unknown origin', async () => {
    const mgr = new CredentialManager()
    const creds = await mgr.getCredentials('http://localhost:3000')
    expect(creds).toEqual([])
  })

  test('saves and retrieves a credential', async () => {
    const mgr = new CredentialManager()
    await mgr.saveCredential('http://localhost:3000', 'admin', 'secret123')
    const creds = await mgr.getCredentials('http://localhost:3000')
    expect(creds).toEqual([{ username: 'admin', password: 'secret123' }])
  })

  test('updates an existing username', async () => {
    const mgr = new CredentialManager()
    await mgr.saveCredential('http://localhost:3000', 'admin', 'secret123')
    await mgr.saveCredential('http://localhost:3000', 'admin', 'newsecret')
    const creds = await mgr.getCredentials('http://localhost:3000')
    expect(creds).toHaveLength(1)
    expect(creds[0].password).toBe('newsecret')
  })

  test('stores multiple accounts per origin', async () => {
    const mgr = new CredentialManager()
    await mgr.saveCredential('http://localhost:3000', 'admin', 'secret123')
    await mgr.saveCredential('http://localhost:3000', 'user2', 'pass456')
    const creds = await mgr.getCredentials('http://localhost:3000')
    expect(creds).toHaveLength(2)
    expect(creds).toEqual(
      expect.arrayContaining([
        { username: 'admin', password: 'secret123' },
        { username: 'user2', password: 'pass456' },
      ])
    )
  })

  test('removes a specific credential', async () => {
    const mgr = new CredentialManager()
    await mgr.saveCredential('http://localhost:3000', 'admin', 'secret123')
    await mgr.saveCredential('http://localhost:3000', 'user2', 'pass456')
    await mgr.removeCredential('http://localhost:3000', 'admin')
    const creds = await mgr.getCredentials('http://localhost:3000')
    expect(creds).toHaveLength(1)
    expect(creds[0].username).toBe('user2')
  })

  test('persists across instances (reads from disk)', async () => {
    const mgr = new CredentialManager()
    await mgr.saveCredential('http://localhost:3000', 'admin', 'secret123')
    // New instance reads from the same file
    const mgr2 = new CredentialManager()
    const creds = await mgr2.getCredentials('http://localhost:3000')
    expect(creds).toEqual([{ username: 'admin', password: 'secret123' }])
  })

  test('removes the origin key when all credentials are removed', async () => {
    const mgr = new CredentialManager()
    await mgr.saveCredential('http://localhost:3000', 'admin', 'secret123')
    await mgr.removeCredential('http://localhost:3000', 'admin')
    // After removal, origin should be absent from the file
    const filePath = path.join(tempRoot, 'preview-credentials.json')
    const written = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'))
    expect(written['http://localhost:3000']).toBeUndefined()
  })
})