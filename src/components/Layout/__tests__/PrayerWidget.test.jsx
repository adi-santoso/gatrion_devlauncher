import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrayerCard, PrayerPill, PrayerIcon, PrayerPanel, formatCountdown, formatHijri } from '../PrayerWidget'

vi.mock('../../../hooks/usePrayerTimes', () => ({
  PRAYER_LIST: [
    { key: 'fajr', label: 'Subuh' },
    { key: 'dhuhr', label: 'Dzuhur' },
    { key: 'asr', label: 'Ashar' },
    { key: 'maghrib', label: 'Maghrib' },
    { key: 'isha', label: 'Isya' },
  ],
}))

const config = { city: 'Jakarta', method: 'KEMENAG', utcOffset: 7, showIn: 'both' }
const now = new Date(2026, 7, 14, 14, 32, 7) // 14:32:07, Friday
const data = {
  now,
  today: [
    { key: 'fajr', label: 'Subuh', time: new Date(), formatted: '04:41' },
    { key: 'dhuhr', label: 'Dzuhur', time: new Date(), formatted: '11:58' },
    { key: 'asr', label: 'Ashar', time: new Date(), formatted: '15:19' },
    { key: 'maghrib', label: 'Maghrib', time: new Date(), formatted: '17:55' },
    { key: 'isha', label: 'Isya', time: new Date(), formatted: '19:06' },
  ],
  next: { key: 'asr', label: 'Ashar', formatted: '15:19' },
  countdown: { hours: 1, minutes: 12, seconds: 34, totalSeconds: 4354 },
  near: false,
  arrived: false,
  inProgress: null,
}

describe('PrayerWidget', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('formats the countdown down to seconds', () => {
    expect(formatCountdown({ hours: 1, minutes: 12, seconds: 34, totalSeconds: 4354 })).toBe('1j 12m 34d')
    expect(formatCountdown({ hours: 0, minutes: 12, seconds: 4, totalSeconds: 724 })).toBe('12m 4d')
    expect(formatCountdown({ hours: 0, minutes: 0, seconds: 9, totalSeconds: 9 })).toBe('9d')
    expect(formatCountdown({ hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 })).toBe('Sekarang!')
  })

  it('formats the Hijri date (Umm al-Qura) with era', () => {
    expect(formatHijri(new Date(2026, 7, 14, 14, 32, 7))).toMatch(/\d{4} H/)
  })

  it('renders the sidebar card: header, clock slide and incoming slide', () => {
    const onExpand = vi.fn()
    render(<PrayerCard data={data} config={config} onExpand={onExpand} />)
    expect(screen.getByText('Pengingat Sholat')).toBeInTheDocument()
    expect(screen.getByText(/Jakarta/)).toBeInTheDocument()
    // Slide A — clock down to seconds + Hijri date
    expect(screen.getByText('14:32:07')).toBeInTheDocument()
    expect(screen.getByText(/\d{4} H/)).toBeInTheDocument()
    // Slide B — incoming prayer like before
    expect(screen.getByText('Ashar')).toBeInTheDocument()
    expect(screen.getByText('15:19')).toBeInTheDocument()
    expect(screen.getByText('1j 12m 34d')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(onExpand).toHaveBeenCalled()
  })

  it('rotates the slides every interval', () => {
    render(<PrayerCard data={data} config={config} onExpand={() => {}} />)
    const track = document.querySelector('[data-slide-index]')
    expect(track).toHaveAttribute('data-slide-index', '0')
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(track).toHaveAttribute('data-slide-index', '1')
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(track).toHaveAttribute('data-slide-index', '0')
  })

  it('shows the ongoing-prayer banner during the 10-minute window', () => {
    render(
      <PrayerCard
        data={{ ...data, inProgress: { key: 'asr', label: 'Ashar', formatted: '15:19' } }}
        config={config}
        onExpand={() => {}}
      />,
    )
    expect(screen.getByText('Sedang Berlangsung')).toBeInTheDocument()
    expect(screen.getByText('Sholat Ashar')).toBeInTheDocument()
    // Incoming slide is replaced, not shown alongside the banner
    expect(screen.queryByText('1j 12m 34d')).not.toBeInTheDocument()
  })

  it('renders the topbar pill with clock and incoming slides', () => {
    const onExpand = vi.fn()
    render(<PrayerPill data={data} config={config} onExpand={onExpand} />)
    expect(screen.getByText('14:32:07')).toBeInTheDocument()
    expect(screen.getByText('Ashar')).toBeInTheDocument()
    expect(screen.getByText('15:19')).toBeInTheDocument()
  })

  it('renders the collapsed icon', () => {
    const onExpand = vi.fn()
    render(<PrayerIcon data={data} onExpand={onExpand} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onExpand).toHaveBeenCalled()
  })

  it('renders the floating panel with clock, hijri, all 5 prayers and closes', () => {
    const onClose = vi.fn()
    render(<PrayerPanel open data={data} config={config} onClose={onClose} />)
    expect(screen.getByText('Pengingat Sholat')).toBeInTheDocument()
    expect(screen.getByText('14:32:07')).toBeInTheDocument()
    expect(screen.getByText(/\d{4} H/)).toBeInTheDocument()
    expect(screen.getByText('Menuju Ashar')).toBeInTheDocument()
    expect(screen.getByText('Subuh')).toBeInTheDocument()
    expect(screen.getByText('Isya')).toBeInTheDocument()
    expect(screen.getAllByText(/Kemenag RI/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the ongoing banner in the panel too', () => {
    render(
      <PrayerPanel
        open
        data={{ ...data, inProgress: { key: 'asr', label: 'Ashar', formatted: '15:19' } }}
        config={config}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Sedang Berlangsung Sholat Ashar')).toBeInTheDocument()
    expect(screen.queryByText('Menuju Ashar')).not.toBeInTheDocument()
    // The ongoing row itself is marked (not the next one)
    expect(screen.getAllByText('● BERLANGSUNG').length).toBe(1)
  })

  it('renders nothing when the panel is closed', () => {
    const { container } = render(<PrayerPanel open={false} data={data} config={config} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
