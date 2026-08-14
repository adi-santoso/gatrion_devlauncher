import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../utils/ipcRenderer', () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  onConfigUpdated: vi.fn(() => () => {}),
}))

import * as ipc from '../../utils/ipcRenderer'
import { useElectronConfig } from '../useElectronConfig'

const baseConfig = {
  theme: 'dark',
  language: 'en',
  sidebarExpanded: true,
  prayer: { showIn: 'both', method: 'KEMENAG', city: 'Jakarta' },
}

describe('useElectronConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ipc.getConfig).mockResolvedValue({ success: true, config: { ...baseConfig } })
  })

  test('loads config on mount', async () => {
    const { result } = renderHook(() => useElectronConfig())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.config.theme).toBe('dark')
  })

  test('updateConfig applies the response and broadcasts to other instances', async () => {
    const updated = { ...baseConfig, prayer: { ...baseConfig.prayer, showIn: 'off' } }
    vi.mocked(ipc.updateConfig).mockResolvedValue({ success: true, config: updated })

    const a = renderHook(() => useElectronConfig())
    await waitFor(() => expect(a.result.current.loading).toBe(false))

    // A second instance — represents MainLayout, which never called updateConfig.
    const b = renderHook(() => useElectronConfig())
    await waitFor(() => expect(b.result.current.loading).toBe(false))

    await act(async () => {
      await a.result.current.updateConfig({ prayer: { showIn: 'off' } })
    })

    expect(a.result.current.config.prayer.showIn).toBe('off')
    // The event must reach the other instance without its own IPC call.
    expect(b.result.current.config.prayer.showIn).toBe('off')
  })

  test('applies config pushed by the main process', async () => {
    const { result } = renderHook(() => useElectronConfig())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const pushed = { ...baseConfig, language: 'id' }
    await act(async () => {
      vi.mocked(ipc.onConfigUpdated).mock.calls[0][0](pushed)
    })
    expect(result.current.config.language).toBe('id')
  })
})
