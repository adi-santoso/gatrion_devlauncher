import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { rotateLogFile } from '../logRotation'

describe('rotateLogFile', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-rotation-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('does nothing below the size threshold', async () => {
    const file = path.join(tempDir, 'main.log')
    await fs.writeFile(file, '{"a":1}\n{"a":2}\n', 'utf8')
    const rotated = await rotateLogFile(file, { maxSize: 1024, maxLines: 1000 })
    expect(rotated).toBe(false)
    expect(await fs.readFile(file, 'utf8')).toBe('{"a":1}\n{"a":2}\n')
    await expect(fs.stat(`${file}.old`)).rejects.toThrow()
  })

  test('rotates when the file exceeds maxSize and keeps the newest lines', async () => {
    const file = path.join(tempDir, 'main.log')
    const lines = Array.from({ length: 1500 }, (_, i) => `{"n":${i}}`)
    await fs.writeFile(file, lines.join('\n'), 'utf8')
    const rotated = await rotateLogFile(file, { maxSize: 1, maxLines: 1000 })
    expect(rotated).toBe(true)
    const kept = (await fs.readFile(file, 'utf8')).split('\n')
    expect(kept).toHaveLength(1000)
    // Newest lines survive (index 500..1499 of the original).
    expect(kept[0]).toBe('{"n":500}')
    expect(kept[kept.length - 1]).toBe('{"n":1499}')
    // The .old backup is cleaned up.
    await expect(fs.stat(`${file}.old`)).rejects.toThrow()
  })

  test('handles a missing file gracefully', async () => {
    const rotated = await rotateLogFile(path.join(tempDir, 'nope.log'), { maxSize: 1 })
    expect(rotated).toBe(false)
  })

  test('defaults to 10 MB / 1000 lines', async () => {
    const file = path.join(tempDir, 'main.log')
    // 20k lines × ~30 bytes ≈ 600 KB — still under the 10 MB default, so no rotation.
    await fs.writeFile(file, Array.from({ length: 20000 }, () => '{"message":"x"}').join('\n'), 'utf8')
    expect(await rotateLogFile(file)).toBe(false)
  })
})
