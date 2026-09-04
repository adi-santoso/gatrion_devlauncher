/**
 * Device simulator presets + helpers for the embedded app preview.
 *
 * Pure module (no React, no Electron) so every helper is unit-testable. The
 * simulator has two layers:
 *  1. viewport resize — the native WebContentsView (or iframe) is sized to the
 *     device's screen so CSS media queries respond to the real viewport;
 *  2. CDP emulation (mobile presets only) — device pixel ratio, touch support
 *     and user agent via `Emulation.setDeviceMetricsOverride`.
 */
import type { DeviceEmulationConfig } from '../../data/preview'

export type DeviceKind = 'phone' | 'tablet' | 'laptop'

export interface DevicePreset {
  id: string
  name: string
  kind: DeviceKind
  /** Portrait CSS-pixel viewport size. */
  width: number
  height: number
  /** CDP: device pixel ratio (mobile presets only). */
  deviceScaleFactor?: number
  /** CDP: mobile viewport semantics + touch emulation (mobile presets only). */
  mobile?: boolean
  /** CDP: user agent override string (mobile presets only). */
  userAgent?: string
}

/** Discriminated selection: fill the area, a known preset, or custom W×H. */
export type DeviceSelection =
  | { mode: 'fill' }
  | { mode: 'preset'; id: string }
  | { mode: 'custom'; width: number; height: number }

export const CUSTOM_DEVICE_ID = 'custom'
export const MIN_CUSTOM_SIZE = 240
export const MAX_CUSTOM_SIZE = 4096

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

export const DEVICE_PRESETS: DevicePreset[] = [
  // Phones
  { id: 'iphone-se', name: 'iPhone SE', kind: 'phone', width: 375, height: 667, deviceScaleFactor: 2, mobile: true, userAgent: IPHONE_UA },
  { id: 'iphone-15', name: 'iPhone 15', kind: 'phone', width: 393, height: 852, deviceScaleFactor: 3, mobile: true, userAgent: IPHONE_UA },
  { id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', kind: 'phone', width: 430, height: 932, deviceScaleFactor: 3, mobile: true, userAgent: IPHONE_UA },
  { id: 'pixel-8', name: 'Pixel 8', kind: 'phone', width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, userAgent: ANDROID_UA },
  { id: 'galaxy-s24', name: 'Galaxy S24', kind: 'phone', width: 360, height: 780, deviceScaleFactor: 3, mobile: true, userAgent: ANDROID_UA },
  // Tablets
  { id: 'ipad', name: 'iPad', kind: 'tablet', width: 768, height: 1024, deviceScaleFactor: 2, mobile: true, userAgent: IPAD_UA },
  { id: 'ipad-pro-11', name: 'iPad Pro 11"', kind: 'tablet', width: 834, height: 1194, deviceScaleFactor: 2, mobile: true, userAgent: IPAD_UA },
  // Laptops / desktop breakpoints (viewport resize only — no CDP override)
  { id: 'laptop-1366', name: 'Laptop 1366', kind: 'laptop', width: 1366, height: 768 },
  { id: 'laptop-1440', name: 'Laptop 1440', kind: 'laptop', width: 1440, height: 900 },
]

export interface Size {
  width: number
  height: number
}

export function findPreset(id: string): DevicePreset | undefined {
  return DEVICE_PRESETS.find((preset) => preset.id === id)
}

/** Clamp custom device dimensions to the supported range. */
export function clampCustom(width: number, height: number): Size {
  return {
    width: Math.min(MAX_CUSTOM_SIZE, Math.max(MIN_CUSTOM_SIZE, Math.round(width))),
    height: Math.min(MAX_CUSTOM_SIZE, Math.max(MIN_CUSTOM_SIZE, Math.round(height))),
  }
}

/** Effective viewport size in portrait, or swapped when `landscape` is set. */
export function effectiveSize(selection: DeviceSelection, landscape: boolean): Size | null {
  let base: Size | null = null
  if (selection.mode === 'custom') {
    base = clampCustom(selection.width, selection.height)
  } else if (selection.mode === 'preset') {
    const preset = findPreset(selection.id)
    base = preset ? { width: preset.width, height: preset.height } : null
  }
  if (!base) return null
  return landscape ? { width: base.height, height: base.width } : base
}

/** Human label for the device pill above the simulated screen (e.g. "iPhone 15 · 393 × 852"). */
export function deviceLabel(selection: DeviceSelection, landscape: boolean): string | null {
  const size = effectiveSize(selection, landscape)
  if (!size) return null
  let name: string | undefined
  if (selection.mode === 'preset') name = findPreset(selection.id)?.name
  else if (selection.mode === 'custom') name = 'Custom'
  if (!name) return null
  return `${name} · ${size.width} × ${size.height}`
}

/** Presets that emulate a touch device (phones/tablets get CDP override). */
export function isTouchPreset(selection: DeviceSelection): boolean {
  return selection.mode === 'preset' && findPreset(selection.id)?.mobile === true
}

/**
 * CDP emulation config for the native view. `null` means "no override" (clear
 * any previous emulation): fill mode, laptops, and custom sizes are pure
 * viewport resizes, so they never attach the debugger.
 */
export function toEmulationConfig(selection: DeviceSelection, landscape: boolean): DeviceEmulationConfig | null {
  const size = effectiveSize(selection, landscape)
  if (!size) return null
  if (selection.mode !== 'preset') return null
  const preset = findPreset(selection.id)
  if (!preset?.mobile) return null
  return {
    width: size.width,
    height: size.height,
    deviceScaleFactor: preset.deviceScaleFactor ?? 1,
    mobile: true,
    userAgent: preset.userAgent,
  }
}

/** localStorage key holding the persisted device selection for a project. */
export function storageKey(projectId: string): string {
  return `devlauncher:preview-device:${projectId}`
}

/** Shape persisted to localStorage by usePreviewDevice. */
export interface PersistedDeviceState {
  selection: DeviceSelection
  landscape: boolean
}

/**
 * Parse a persisted device state, discarding unknown preset ids / malformed
 * values so a stale or hand-edited entry can never break the UI.
 */
export function parsePersistedDeviceState(raw: string | null): PersistedDeviceState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedDeviceState> | null
    if (!parsed || typeof parsed !== 'object') return null
    const landscape = parsed.landscape === true
    const sel = parsed.selection as DeviceSelection | undefined
    if (!sel || typeof sel !== 'object') return null
    if (sel.mode === 'fill') return { selection: { mode: 'fill' }, landscape }
    if (sel.mode === 'preset' && typeof sel.id === 'string' && findPreset(sel.id)) {
      return { selection: { mode: 'preset', id: sel.id }, landscape }
    }
    if (sel.mode === 'custom' && Number.isFinite(sel.width) && Number.isFinite(sel.height)) {
      const { width, height } = clampCustom(sel.width, sel.height)
      return { selection: { mode: 'custom', width, height }, landscape }
    }
    return null
  } catch {
    return null
  }
}