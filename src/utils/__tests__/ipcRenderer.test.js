import { beforeEach, describe, expect, it, vi } from 'vitest'
import { restartProject, startProject } from '../ipcRenderer'

describe('process IPC wrappers', () => {
  beforeEach(() => {
    window.electron = {
      startProject: vi.fn().mockResolvedValue({ success: true }),
      restartProject: vi.fn().mockResolvedValue({ success: true }),
    }
  })

  it('sends only the project ID when starting', async () => {
    await startProject('project-1')
    expect(window.electron.startProject).toHaveBeenCalledWith('project-1')
  })

  it('sends only the project ID when restarting', async () => {
    await restartProject('project-1')
    expect(window.electron.restartProject).toHaveBeenCalledWith('project-1')
  })
})
