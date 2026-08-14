import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import OmpConfig from '../OmpConfig'

describe('OmpConfig', () => {
  let homeDir
  let config

  beforeEach(() => {
    homeDir = path.join(os.tmpdir(), `ompconfig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    config = new OmpConfig(homeDir)
  })

  afterEach(async () => {
    await fs.rm(homeDir, { recursive: true, force: true })
  })

  test('listProviders masks api keys and reports model counts', async () => {
    await config.saveProvider({
      name: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-0123456789abcdef',
      models: [{ id: 'claude-sonnet-4' }, { id: 'claude-opus-4', name: 'Opus' }],
    })
    const { providers } = await config.listProviders()
    expect(providers).toHaveLength(1)
    const provider = providers[0]
    expect(provider.name).toBe('anthropic')
    expect(provider.apiKey).not.toContain('0123456789')
    expect(provider.modelCount).toBe(2)
    expect(provider.models).toContainEqual({ id: 'claude-opus-4', name: 'Opus' })
  })

  test('saveProvider validates name and base URL', async () => {
    expect(await config.saveProvider({ name: '  ', baseUrl: 'https://x' })).toEqual({
      success: false,
      error: 'Provider name is required',
    })
    expect(await config.saveProvider({ name: 'bad name!', baseUrl: 'https://x' })).toEqual({
      success: false,
      error: expect.stringMatching(/letters, numbers/),
    })
    expect(await config.saveProvider({ name: 'ok', baseUrl: '' })).toEqual({
      success: false,
      error: 'Base URL is required',
    })
  })

  test('saveProvider normalizes the base URL scheme', async () => {
    await config.saveProvider({ name: 'local', baseUrl: 'localhost:11434/v1/' })
    const raw = await fs.readFile(path.join(homeDir, '.omp', 'agent', 'models.yml'), 'utf8')
    expect(raw).toContain('https://localhost:11434/v1')
    expect(raw).not.toContain('//v1/')
  })

  test('deleteProvider removes and reports missing providers', async () => {
    await config.saveProvider({ name: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com' })
    expect(await config.deleteProvider('gemini')).toEqual({ success: true })
    expect(await config.deleteProvider('gemini')).toEqual({ success: false, error: expect.stringMatching(/not found/) })
  })

  test('setDefaultModel and getDefaultModel round-trip through config.yml', async () => {
    expect(await config.getDefaultModel()).toBeNull()
    await config.setDefaultModel('anthropic/claude-sonnet-4')
    expect(await config.getDefaultModel()).toBe('anthropic/claude-sonnet-4')
    expect(await config.setDefaultModel('')).toEqual({ success: false, error: 'Default model is required' })
  })

  test('getConfig returns providers + default + configPath', async () => {
    await config.saveProvider({ name: 'x', baseUrl: 'https://x.example.com' })
    await config.setDefaultModel('x/model-1')
    const result = await config.getConfig()
    expect(result.providers).toHaveLength(1)
    expect(result.defaultModel).toBe('x/model-1')
    expect(result.configPath).toContain('.omp')
  })

  test('writes are preceded by a timestamped backup', async () => {
    await config.saveProvider({ name: 'a', baseUrl: 'https://a.example.com' })
    const modelsPath = path.join(homeDir, '.omp', 'agent', 'models.yml')
    const before = await fs.readFile(modelsPath, 'utf8')
    await config.saveProvider({ name: 'b', baseUrl: 'https://b.example.com' })
    const backups = (await fs.readdir(path.dirname(modelsPath))).filter((f) => f.startsWith('models.yml.bak-'))
    expect(backups).toHaveLength(1)
    expect(await fs.readFile(path.join(path.dirname(modelsPath), backups[0]), 'utf8')).toBe(before)
  })

  test('tolerates missing files everywhere', async () => {
    expect(await config.readModels()).toEqual({})
    expect(await config.listProviders()).toEqual({ providers: [] })
    expect(await config.getDefaultModel()).toBeNull()
  })
})
