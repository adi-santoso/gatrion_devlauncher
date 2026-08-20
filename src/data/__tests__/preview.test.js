import { beforeEach, describe, expect, it, vi } from 'vitest'
import { previewNudge, previewHide, previewSetBounds } from '../preview'

// invoke() resolves `window.electron[method]`, so these wrappers must use the
// preload bridge name (camelCase), not the IPC channel name (kebab-case).
describe('preview data layer', () => {
  beforeEach(() => {
    window.electron = {
      previewNudge: vi.fn().mockResolvedValue({ success: true }),
      previewHide: vi.fn().mockResolvedValue({ success: true }),
      previewSetBounds: vi.fn().mockResolvedValue({ success: true }),
    }
  })

  it('previewNudge calls the bridge method with the project id', async () => {
    const result = await previewNudge('p1')
    expect(window.electron.previewNudge).toHaveBeenCalledWith('p1')
    expect(window.electron['preview-nudge']).toBeUndefined()
    expect(result).toEqual({ success: true })
  })

  it('previewNudge is a silent no-op outside Electron', async () => {
    delete window.electron
    // The repaint nudge is a desktop-only optimization: in the browser dev
    // server there is no native view, so it must resolve successfully instead
    // of surfacing an error to the preview tab.
    await expect(previewNudge('p1')).resolves.toEqual({ success: true })
  })

  it('bounds/hide wrappers forward their arguments', async () => {
    await previewHide('p1')
    expect(window.electron.previewHide).toHaveBeenCalledWith('p1')

    const bounds = { x: 0, y: 0, width: 800, height: 600 }
    await previewSetBounds('p1', bounds)
    expect(window.electron.previewSetBounds).toHaveBeenCalledWith('p1', bounds)
  })
})
