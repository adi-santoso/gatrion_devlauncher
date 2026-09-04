import { describe, expect, it } from 'vitest'
import {
  CUSTOM_DEVICE_ID,
  DEVICE_PRESETS,
  MAX_CUSTOM_SIZE,
  MIN_CUSTOM_SIZE,
  clampCustom,
  deviceLabel,
  effectiveSize,
  findPreset,
  isTouchPreset,
  parsePersistedDeviceState,
  storageKey,
  toEmulationConfig,
} from '../devicePresets'

const iPhone = { mode: 'preset', id: 'iphone-15' }
const laptop = { mode: 'preset', id: 'laptop-1366' }
const fill = { mode: 'fill' }
const custom = { mode: 'custom', width: 500, height: 900 }

describe('DEVICE_PRESETS', () => {
  it('has unique ids, positive integer sizes, and a name per preset', () => {
    const ids = new Set()
    for (const preset of DEVICE_PRESETS) {
      expect(ids.has(preset.id)).toBe(false)
      ids.add(preset.id)
      expect(preset.name.length).toBeGreaterThan(0)
      expect(Number.isInteger(preset.width)).toBe(true)
      expect(Number.isInteger(preset.height)).toBe(true)
      expect(preset.width).toBeGreaterThan(0)
      expect(preset.height).toBeGreaterThan(0)
      expect(['phone', 'tablet', 'laptop']).toContain(preset.kind)
    }
  })

  it('every touch preset (phone/tablet) carries DPR and a UA; laptops do not', () => {
    for (const preset of DEVICE_PRESETS) {
      if (preset.mobile) {
        expect(preset.deviceScaleFactor).toBeGreaterThan(1)
        expect(preset.userAgent).toBeTruthy()
      } else {
        expect(preset.kind).toBe('laptop')
      }
    }
  })

  it('presets cover phone, tablet and laptop breakpoints', () => {
    expect(DEVICE_PRESETS.some((p) => p.kind === 'phone' && p.width < 500)).toBe(true)
    expect(DEVICE_PRESETS.some((p) => p.kind === 'tablet' && p.width >= 700 && p.width < 900)).toBe(true)
    expect(DEVICE_PRESETS.some((p) => p.kind === 'laptop' && p.width >= 1200)).toBe(true)
  })
})

describe('effectiveSize', () => {
  it('returns null for fill mode', () => {
    expect(effectiveSize(fill, false)).toBeNull()
    expect(effectiveSize(fill, true)).toBeNull()
  })

  it('returns the preset portrait size, and swaps it when landscape', () => {
    expect(effectiveSize(iPhone, false)).toEqual({ width: 393, height: 852 })
    expect(effectiveSize(iPhone, true)).toEqual({ width: 852, height: 393 })
  })

  it('uses custom dimensions (clamped) and swaps them when landscape', () => {
    expect(effectiveSize(custom, false)).toEqual({ width: 500, height: 900 })
    expect(effectiveSize(custom, true)).toEqual({ width: 900, height: 500 })
    expect(effectiveSize({ mode: 'custom', width: 5, height: 99999 }, false)).toEqual({
      width: MIN_CUSTOM_SIZE,
      height: MAX_CUSTOM_SIZE,
    })
  })

  it('returns null for an unknown preset id', () => {
    expect(effectiveSize({ mode: 'preset', id: 'nope' }, false)).toBeNull()
  })
})

describe('clampCustom', () => {
  it('clamps into the supported range and rounds', () => {
    expect(clampCustom(240, 4096)).toEqual({ width: 240, height: 4096 })
    expect(clampCustom(1, 2)).toEqual({ width: MIN_CUSTOM_SIZE, height: MIN_CUSTOM_SIZE })
    expect(clampCustom(10000, 300.4)).toEqual({ width: MAX_CUSTOM_SIZE, height: 300 })
  })
})

describe('deviceLabel', () => {
  it('labels presets with name and effective dimensions', () => {
    expect(deviceLabel(iPhone, false)).toBe('iPhone 15 · 393 × 852')
    expect(deviceLabel(iPhone, true)).toBe('iPhone 15 · 852 × 393')
    expect(deviceLabel(custom, false)).toBe('Custom · 500 × 900')
  })

  it('returns null for fill mode and unknown presets', () => {
    expect(deviceLabel(fill, false)).toBeNull()
    expect(deviceLabel({ mode: 'preset', id: 'ghost' }, false)).toBeNull()
  })
})

describe('isTouchPreset / toEmulationConfig', () => {
  it('phones and tablets are touch presets; laptops/custom/fill are not', () => {
    expect(isTouchPreset(iPhone)).toBe(true)
    expect(isTouchPreset({ mode: 'preset', id: 'ipad' })).toBe(true)
    expect(isTouchPreset(laptop)).toBe(false)
    expect(isTouchPreset(custom)).toBe(false)
    expect(isTouchPreset(fill)).toBe(false)
  })

  it('builds a CDP config only for touch presets, using effective (swapped) size', () => {
    const config = toEmulationConfig(iPhone, false)
    expect(config).not.toBeNull()
    expect(config).toMatchObject({ width: 393, height: 852, deviceScaleFactor: 3, mobile: true })
    expect(config.userAgent).toContain('iPhone')

    const landscape = toEmulationConfig(iPhone, true)
    expect(landscape).toMatchObject({ width: 852, height: 393 })
  })

  it('returns null (clear) for fill, laptop, custom and unknown presets', () => {
    expect(toEmulationConfig(fill, false)).toBeNull()
    expect(toEmulationConfig(laptop, false)).toBeNull()
    expect(toEmulationConfig(custom, false)).toBeNull()
    expect(toEmulationConfig({ mode: 'preset', id: 'ghost' }, false)).toBeNull()
  })
})

describe('parsePersistedDeviceState / storageKey', () => {
  it('round-trips a valid persisted state', () => {
    const raw = JSON.stringify({ selection: { mode: 'preset', id: 'pixel-8' }, landscape: true })
    expect(parsePersistedDeviceState(raw)).toEqual({
      selection: { mode: 'preset', id: 'pixel-8' },
      landscape: true,
    })
  })

  it('accepts fill and clamped custom states', () => {
    expect(parsePersistedDeviceState(JSON.stringify({ selection: { mode: 'fill' }, landscape: false })))
      .toEqual({ selection: { mode: 'fill' }, landscape: false })
    expect(parsePersistedDeviceState(JSON.stringify({ selection: { mode: 'custom', width: 10, height: 900 }, landscape: false })))
      .toEqual({ selection: { mode: 'custom', width: MIN_CUSTOM_SIZE, height: 900 }, landscape: false })
  })

  it('rejects null, garbage, unknown presets and malformed shapes', () => {
    expect(parsePersistedDeviceState(null)).toBeNull()
    expect(parsePersistedDeviceState('not json')).toBeNull()
    expect(parsePersistedDeviceState(JSON.stringify({ selection: { mode: 'preset', id: 'ghost' }, landscape: false }))).toBeNull()
    expect(parsePersistedDeviceState(JSON.stringify({ selection: { mode: 'bogus' }, landscape: false }))).toBeNull()
    expect(parsePersistedDeviceState(JSON.stringify({ selection: null, landscape: false }))).toBeNull()
  })

  it('scopes the storage key per project', () => {
    expect(storageKey('p1')).toBe('devlauncher:preview-device:p1')
    expect(storageKey('p1')).not.toBe(storageKey('p2'))
  })

  it('helpers agree on the exported preset ids', () => {
    for (const preset of DEVICE_PRESETS) {
      expect(findPreset(preset.id)).toBe(preset)
      expect(preset.id).not.toBe(CUSTOM_DEVICE_ID)
    }
    expect(findPreset('nope')).toBeUndefined()
  })
})
