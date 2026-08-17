import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listEnvFiles, readEnvFile, writeEnvFile } from '../projects'

// Regression: invoke() looks up `window.electron[method]`, so the method must
// be the preload bridge name (camelCase), NOT the IPC channel name (kebab).
// Passing the channel name made window.electron[method] undefined ->
// "fn is not a function" and the Environment tab stayed empty.
describe('env file data layer', () => {
  beforeEach(() => {
    window.electron = {
      listEnvFiles: vi.fn().mockResolvedValue({ success: true, files: ['.env'] }),
      readEnvFile: vi.fn().mockResolvedValue({ success: true, fileName: '.env', content: 'A=1\n' }),
      writeEnvFile: vi.fn().mockResolvedValue({ success: true, fileName: '.env' }),
    }
  })

  it('listEnvFiles calls the preload method name, not the IPC channel', async () => {
    await listEnvFiles('C:/proj')
    expect(window.electron.listEnvFiles).toHaveBeenCalledWith('C:/proj')
    expect(window.electron['list-env-files']).toBeUndefined()
  })

  it('readEnvFile forwards path and file name', async () => {
    const result = await readEnvFile('C:/proj', '.env.local')
    expect(window.electron.readEnvFile).toHaveBeenCalledWith('C:/proj', '.env.local')
    expect(result.content).toBe('A=1\n')
  })

  it('writeEnvFile forwards path, file name and content', async () => {
    await writeEnvFile('C:/proj', '.env', 'A=2\n')
    expect(window.electron.writeEnvFile).toHaveBeenCalledWith('C:/proj', '.env', 'A=2\n')
  })

  it('falls back to empty file list without the Electron bridge', async () => {
    delete window.electron
    const result = await listEnvFiles('C:/proj')
    expect(result).toEqual({ success: true, files: [] })
  })
})
