import { beforeEach, describe, expect, it, vi } from 'vitest'
import { restartProject, startAllProjects, startProject } from '../ipcRenderer'

describe('process IPC wrappers', () => {
  beforeEach(() => {
    window.electron = {
      startProject: vi.fn().mockResolvedValue({ success: true }),
      restartProject: vi.fn().mockResolvedValue({ success: true }),
      startAllProjects: vi.fn().mockResolvedValue([]),
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

  it('sends targeted project IDs when starting a workspace', async () => {
    await startAllProjects(['project-1', 'project-2'])
    expect(window.electron.startAllProjects).toHaveBeenCalledWith(['project-1', 'project-2'], undefined)
  })

  it('forwards a stagger delay when starting a workspace', async () => {
    await startAllProjects(['project-1', 'project-2'], 1500)
    expect(window.electron.startAllProjects).toHaveBeenCalledWith(['project-1', 'project-2'], 1500)
  })
})
