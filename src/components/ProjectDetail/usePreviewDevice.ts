/**
 * Device-simulator state for one preview: selection + orientation, persisted
 * per project in localStorage so switching projects keeps each setup.
 */
import { useState } from 'react'
import type { DeviceEmulationConfig } from '../../data/preview'
import type { DeviceSelection, Size } from './devicePresets'
import { effectiveSize, parsePersistedDeviceState, storageKey, toEmulationConfig } from './devicePresets'

export interface UsePreviewDeviceResult {
  device: DeviceSelection
  landscape: boolean
  /** Effective viewport size (swapped when landscape), or null for fill mode. */
  size: Size | null
  /** CDP emulation config for the native view (mobile presets), else null. */
  emulation: DeviceEmulationConfig | null
  setDevice: (device: DeviceSelection) => void
  toggleLandscape: () => void
}

function loadInitial(projectId: string): { device: DeviceSelection; landscape: boolean } {
  try {
    const parsed = parsePersistedDeviceState(window.localStorage.getItem(storageKey(projectId)))
    if (parsed) return { device: parsed.selection, landscape: parsed.landscape }
  } catch {
    /* localStorage unavailable (private mode / tests) — keep the default */
  }
  return { device: { mode: 'fill' }, landscape: false }
}

export function usePreviewDevice(projectId: string): UsePreviewDeviceResult {
  const [{ device, landscape }, setState] = useState(() => loadInitial(projectId))

  const persist = (next: { device: DeviceSelection; landscape: boolean }): void => {
    setState(next)
    try {
      window.localStorage.setItem(storageKey(projectId), JSON.stringify({ selection: next.device, landscape: next.landscape }))
    } catch {
      /* non-fatal: selection just won't survive a restart */
    }
  }

  return {
    device,
    landscape,
    size: effectiveSize(device, landscape),
    emulation: toEmulationConfig(device, landscape),
    setDevice: (next) => persist({ device: next, landscape }),
    toggleLandscape: () => persist({ device, landscape: !landscape }),
  }
}