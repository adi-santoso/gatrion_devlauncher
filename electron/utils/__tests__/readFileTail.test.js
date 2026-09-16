import { expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { readFileTail } from '../readFileTail'

it('handles empty files, bounded tails, and a rotated/truncated log', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tail-'))
  const file = path.join(root, 'laravel.log')
  await fs.writeFile(file, '')
  expect(await readFileTail(file, 2)).toBe('')
  await fs.writeFile(file, `${'old line\n'.repeat(400000)}first\r\nsecond\r\nthird`)
  expect(await readFileTail(file, 2)).toBe('second\nthird')
  const bounded = await readFileTail(file, 1000000)
  expect(Buffer.byteLength(bounded)).toBeLessThanOrEqual(2 * 1024 * 1024)
  await fs.writeFile(file, 'rotated')
  expect(await readFileTail(file, 100)).toBe('rotated')
  await fs.rm(root, { recursive: true })
})
