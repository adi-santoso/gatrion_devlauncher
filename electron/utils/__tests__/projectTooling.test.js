import { beforeEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { backupFiles, packageManager, parseNodeOutdated, pythonTool, scanNode, updateNode } from '../projectTooling'

vi.mock('../packageRunner', () => ({ execTool: vi.fn() }))
vi.mock('../npmRunner', () => ({ execNpm: vi.fn() }))
const { execTool } = await import('../packageRunner')
const { execNpm } = await import('../npmRunner')
let root
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tooling-'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@9.0.0' }))
})

it('uses the declared manager even when another lockfile exists', async () => {
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}')
  expect(packageManager(root)).toBe('pnpm')
  execTool.mockResolvedValue('{"demo":{"current":"1","wanted":"2","latest":"3"}}')
  expect((await scanNode(root)).packages.demo.latest).toBe('3')
  expect(execTool).toHaveBeenCalledWith('pnpm', root, ['outdated', '--format', 'json'], expect.any(Object))
  expect(execNpm).not.toHaveBeenCalled()
})

it('backs up existing manifests before a compatible update and returns actual backup names', async () => {
  execTool.mockResolvedValue('updated')
  const result = await updateNode(root, 'demo')
  expect(execTool).toHaveBeenCalledWith('pnpm', root, ['update', 'demo'], expect.any(Object))
  expect(result.backups).toHaveLength(1)
  expect(fs.readFileSync(path.join(root, result.backups[0]), 'utf8')).toBe(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
})

it('surfaces backup failure rather than silently continuing', async () => {
  fs.mkdirSync(path.join(root, 'composer.lock'))
  await expect(backupFiles(root, ['composer.lock'])).rejects.toThrow()
})

it('requires the project Python virtual environment instead of global pip', () => {
  expect(() => pythonTool(root)).toThrow('No project virtual environment')
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  fs.mkdirSync(path.dirname(python), { recursive: true })
  fs.writeFileSync(python, '')
  expect(pythonTool(root)).toBe(python)
})

it.each(['not JSON', '[]', '{"error":"offline"}', '{"demo":{}}'])('rejects invalid Node scan %s', raw => {
  expect(() => parseNodeOutdated(raw)).toThrow()
})
