import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PrayerCard, PrayerPill, PrayerIcon, PrayerPanel, formatCountdown } from '../PrayerWidget'

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
const data = {
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
}

describe('PrayerWidget', () => {
  it('formats the countdown down to seconds', () => {
    expect(formatCountdown({ hours: 1, minutes: 12, seconds: 34, totalSeconds: 4354 })).toBe('1j 12m 34d')
    expect(formatCountdown({ hours: 0, minutes: 12, seconds: 4, totalSeconds: 724 })).toBe('12m 4d')
    expect(formatCountdown({ hours: 0, minutes: 0, seconds: 9, totalSeconds: 9 })).toBe('9d')
    expect(formatCountdown({ hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 })).toBe('Sekarang!')
  })

  it('renders the sidebar card and expands on click', () => {
    const onExpand = vi.fn()
    render(<PrayerCard data={data} config={config} onExpand={onExpand} />)
    expect(screen.getByText('Pengingat Sholat')).toBeInTheDocument()
    expect(screen.getByText('Ashar')).toBeInTheDocument()
    expect(screen.getByText('15:19')).toBeInTheDocument()
    expect(screen.getByText('1j 12m 34d')).toBeInTheDocument()
    expect(screen.getByText(/Jakarta/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(onExpand).toHaveBeenCalled()
  })

  it('renders the topbar pill', () => {
    const onExpand = vi.fn()
    render(<PrayerPill data={data} config={config} onExpand={onExpand} />)
    expect(screen.getByText('Ashar')).toBeInTheDocument()
    expect(screen.getByText('15:19')).toBeInTheDocument()
  })

  it('renders the collapsed icon', () => {
    const onExpand = vi.fn()
    render(<PrayerIcon data={data} onExpand={onExpand} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onExpand).toHaveBeenCalled()
  })

  it('renders the floating panel with all 5 prayers and closes', () => {
    const onClose = vi.fn()
    render(<PrayerPanel open data={data} config={config} onClose={onClose} />)
    expect(screen.getByText('Pengingat Sholat')).toBeInTheDocument()
    expect(screen.getAllByText('Ashar').length).toBeGreaterThan(1)
    expect(screen.getByText('Subuh')).toBeInTheDocument()
    expect(screen.getByText('Isya')).toBeInTheDocument()
    expect(screen.getByText('01:12:34')).toBeInTheDocument()
    expect(screen.getAllByText(/Kemenag RI/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when the panel is closed', () => {
    const { container } = render(<PrayerPanel open={false} data={data} config={config} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
