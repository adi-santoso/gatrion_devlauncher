import { useState, useEffect, useRef, useMemo } from 'react'
import { getPrayerTimes } from '../utils/prayerTimes'
import type { AppConfig } from '../types/shared'

/** The 5 obligatory prayers, Indonesian labels. */
export const PRAYER_LIST = [
  { key: 'fajr', label: 'Subuh' },
  { key: 'dhuhr', label: 'Dzuhur' },
  { key: 'asr', label: 'Ashar' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha', label: 'Isya' },
] as const

export interface PrayerItem {
  key: string
  label: string
  time: Date
  formatted: string
}

export interface PrayerCountdown {
  hours: number
  minutes: number
  seconds: number
  totalSeconds: number
}

export interface PrayerTimesResult {
  today: PrayerItem[]
  next: PrayerItem
  countdown: PrayerCountdown
  near: boolean
  arrived: boolean
  now: Date
  inProgress: PrayerItem | null
}

export interface PrayerTimePayload {
  key: string
  label: string
  formatted: string
}

/** Build a wall-clock Date for a float hour (matching the displayed HH:MM). */
function prayerDate(day: Date, hours: number): Date {
  const date = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  date.setMinutes(Math.round(hours * 60))
  return date
}

/**
 * Live prayer times for the configured location.
 *
 * @param config - the `prayer` config block (or null/undefined to disable)
 * @param onPrayerTime - fired exactly once when a prayer time arrives while the app is watching
 */
export default function usePrayerTimes(
  config: AppConfig['prayer'] | null | undefined,
  onPrayerTime?: (prayer: PrayerTimePayload) => void
): PrayerTimesResult | null {
  const configRef = useRef(config)
  configRef.current = config
  const onPrayerTimeRef = useRef(onPrayerTime)
  onPrayerTimeRef.current = onPrayerTime
  const firedRef = useRef<string | null>(null)
  const prevNowRef = useRef<number | null>(null)

  const [now, setNow] = useState<Date>(() => new Date())

  // Ticking clock — a chained setTimeout aligned to the next second boundary,
  // so the countdown stays accurate even after the app sits in the background.
  useEffect(() => {
    if (!config) return
    const timer = setTimeout(() => setNow(new Date()), 1000 - (Date.now() % 1000) + 10)
    return () => clearTimeout(timer)
  }, [now, config])

  const result = useMemo<PrayerTimesResult | null>(() => {
    const c = configRef.current
    if (!c) return null

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const opts = { method: c.method, adjustments: c.adjustments }
    const todayTimes = getPrayerTimes(today, c.latitude, c.longitude, c.utcOffset, opts)
    const tomorrowTimes = getPrayerTimes(tomorrow, c.latitude, c.longitude, c.utcOffset, opts)

    const mk = (key: string, label: string, times: ReturnType<typeof getPrayerTimes>, day: Date): PrayerItem => ({
      key,
      label,
      time: prayerDate(day, times[key as keyof typeof times] as number),
      formatted: (times.formatted as Record<string, string>)[key] || '',
    })

    const todayList: PrayerItem[] = PRAYER_LIST.map((p) => mk(p.key, p.label, todayTimes, today))
    // Include tomorrow's fajr as the rollover candidate after Isya.
    const candidates: PrayerItem[] = [...todayList, mk('fajr', 'Subuh', tomorrowTimes, tomorrow)]

    const nowMs = now.getTime()
    const next = candidates.find((p) => p.time.getTime() > nowMs) || candidates[candidates.length - 1]
    const diffMs = Math.max(0, next.time.getTime() - nowMs)
    const totalSeconds = Math.floor(diffMs / 1000)

    // "Sedang berlangsung" window: the latest prayer whose time arrived within
    // the last 10 minutes (checked newest-first, today's schedule only).
    const IN_PROGRESS_WINDOW_MS = 10 * 60 * 1000
    let inProgress: PrayerItem | null = null
    for (let i = todayList.length - 1; i >= 0; i--) {
      const elapsed = nowMs - todayList[i].time.getTime()
      if (elapsed >= 0 && elapsed <= IN_PROGRESS_WINDOW_MS) {
        inProgress = todayList[i]
        break
      }
    }

    return {
      today: todayList,
      next,
      countdown: {
        hours: Math.floor(totalSeconds / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
        totalSeconds,
      },
      near: totalSeconds <= 15 * 60,
      arrived: totalSeconds <= 0,
      now,
      inProgress,
    }
  }, [now])

  // Fire the notification exactly once when the next prayer time is crossed.
  useEffect(() => {
    if (!result || !configRef.current) return
    const nextMs = result.next.time.getTime()
    const prevMs = prevNowRef.current
    prevNowRef.current = now.getTime()
    if (prevMs === null) return // first tick — never fire for a prayer that already passed

    const crossed = prevMs < nextMs && now.getTime() >= nextMs
    if (!crossed) return
    const fireKey = `${result.next.key}|${result.next.time.toDateString()}`
    if (firedRef.current === fireKey) return
    firedRef.current = fireKey
    onPrayerTimeRef.current?.({ key: result.next.key, label: result.next.label, formatted: result.next.formatted })
  }, [result, now])

  return result
}

/** Short pleasant chime via Web Audio (no asset needed). */
export function playPrayerChime(): void {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return
  try {
    const ctx = new Ctx()
    const tone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + start)
      gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur + 0.05)
    }
    tone(523.25, 0, 0.9)   // C5
    tone(659.25, 0.18, 1.0) // E5
    tone(783.99, 0.36, 1.2) // G5
  } catch {
    /* audio unavailable — ignore */
  }
}
