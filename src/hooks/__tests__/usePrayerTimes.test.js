import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import usePrayerTimes from '../usePrayerTimes'
import { getPrayerTimes } from '../../utils/prayerTimes'

// Jakarta, Kemenag RI — the exact schedule is computed from the same module
// the hook uses, so the assertions stay valid regardless of date/timezone.
const LAT = -6.2088
const LON = 106.8456
const UTC = 7
const config = { city: 'Jakarta', latitude: LAT, longitude: LON, utcOffset: UTC, method: 'KEMENAG', showIn: 'both' }

const dayAt = (h, m = 0, s = 0) => {
  const d = new Date(2026, 7, 14)
  d.setHours(h, m, s, 0)
  return d
}

const arrivalMs = (key) => {
  const times = getPrayerTimes(new Date(2026, 7, 14), LAT, LON, UTC, { method: 'KEMENAG' })
  const d = new Date(2026, 7, 14)
  d.setMinutes(Math.round(times[key] * 60))
  return d.getTime()
}

describe('usePrayerTimes — inProgress window', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('is null outside any prayer window', () => {
    // 3 minutes before Fajr: nothing in progress, next is Subuh
    vi.setSystemTime(arrivalMs('fajr') - 3 * 60 * 1000)
    const { result } = renderHook(() => usePrayerTimes(config, () => {}))
    expect(result.current.inProgress).toBeNull()
    expect(result.current.next.key).toBe('fajr')
  })

  it('marks a prayer as in progress within 10 minutes of arrival', () => {
    // 3 minutes after Ashar: Ashar is "sedang berlangsung", next is Maghrib
    vi.setSystemTime(arrivalMs('asr') + 3 * 60 * 1000)
    const { result } = renderHook(() => usePrayerTimes(config, () => {}))
    expect(result.current.inProgress?.key).toBe('asr')
    expect(result.current.next.key).toBe('maghrib')
  })

  it('clears the window 10 minutes after arrival', () => {
    // 12 minutes after Ashar: window over, no prayer in progress
    vi.setSystemTime(arrivalMs('asr') + 12 * 60 * 1000)
    const { result } = renderHook(() => usePrayerTimes(config, () => {}))
    expect(result.current.inProgress).toBeNull()
    expect(result.current.next.key).toBe('maghrib')
  })

  it('rolls over to tomorrows Fajr after Isya + 10 minutes', () => {
    vi.setSystemTime(arrivalMs('isha') + 12 * 60 * 1000)
    const { result } = renderHook(() => usePrayerTimes(config, () => {}))
    expect(result.current.inProgress).toBeNull()
    expect(result.current.next.key).toBe('fajr')
    expect(result.current.countdown.totalSeconds).toBeGreaterThan(0)
  })

  it('exposes the ticking now value', () => {
    vi.setSystemTime(dayAt(14, 32, 7))
    const { result } = renderHook(() => usePrayerTimes(config, () => {}))
    expect(result.current.now.getHours()).toBe(14)
    expect(result.current.now.getMinutes()).toBe(32)
    expect(result.current.now.getSeconds()).toBe(7)
  })
})
