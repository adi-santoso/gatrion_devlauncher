import { describe, test, expect } from 'vitest'
import { applyConfigUpdates, normalizeConfig, DEFAULT_CONFIG } from '../../configSchema'

describe('configSchema', () => {
  test('migrates legacy flat fields into nested sections', () => {
    const migrated = normalizeConfig({
      theme: 'light',
      notifyOnStart: false,
      notifyOnCrash: true,
      notificationSound: true,
      terminalFontSize: 16,
      terminalMaxLines: 2000,
      terminalAutoScroll: false,
    })
    expect(migrated.notifications).toEqual({ onStart: false, onError: true, sound: true })
    expect(migrated.terminal).toEqual({ fontSize: 16, maxLines: 2000, autoScroll: false })
    expect(migrated.preview).toEqual({ keepAlive: true })
    expect(migrated.prayer).toEqual({
      showIn: 'both',
      method: 'KEMENAG',
      city: 'Jakarta',
      latitude: -6.2088,
      longitude: 106.8456,
      utcOffset: 7,
      adjustments: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
      notify: true,
      sound: true,
    })
  })

  test('applyConfigUpdates merges nested notification changes', () => {
    const base = normalizeConfig()
    const updated = applyConfigUpdates(base, { notifications: { sound: false } })
    expect(updated.notifications.onStart).toBe(DEFAULT_CONFIG.notifications.onStart)
    expect(updated.notifications.sound).toBe(false)
    expect(applyConfigUpdates(base, { preview: { keepAlive: false } }).preview.keepAlive).toBe(false)
  })

  test('applyConfigUpdates rejects unknown or mistyped fields', () => {
    const base = normalizeConfig()
    expect(() => applyConfigUpdates(base, { unknown: true })).toThrow(/Unsupported config field/)
    expect(() => applyConfigUpdates(base, { startOnBoot: 'yes' })).toThrow(/must be a boolean/)
    expect(() => applyConfigUpdates(base, { preview: { keepAlive: 'yes' } })).toThrow(/preview.keepAlive must be a boolean/)
    expect(() => applyConfigUpdates(base, { preview: { bogus: true } })).toThrow(/Unsupported preview field/)
  })

  test('prayer updates validate method, location and adjustments', () => {
    const base = normalizeConfig()
    const prayerUpdated = applyConfigUpdates(base, {
      prayer: { showIn: 'sidebar', method: 'MWL', city: 'Bandung', latitude: -6.9175, longitude: 107.6191, utcOffset: 7, adjustments: { asr: 2 }, notify: false, sound: false },
    })
    expect(prayerUpdated.prayer.showIn).toBe('sidebar')
    expect(prayerUpdated.prayer.method).toBe('MWL')
    expect(prayerUpdated.prayer.city).toBe('Bandung')
    expect(prayerUpdated.prayer.adjustments.asr).toBe(2)
    expect(prayerUpdated.prayer.adjustments.fajr).toBe(0)
    expect(prayerUpdated.prayer.notify).toBe(false)
    expect(prayerUpdated.prayer.sound).toBe(false)

    expect(() => applyConfigUpdates(base, { prayer: { showIn: 'middle' } })).toThrow(/prayer.showIn must be/)
    expect(() => applyConfigUpdates(base, { prayer: { method: 'BOGUS' } })).toThrow(/prayer.method is invalid/)
    expect(() => applyConfigUpdates(base, { prayer: { latitude: 200 } })).toThrow(/prayer.latitude must be/)
    expect(() => applyConfigUpdates(base, { prayer: { utcOffset: 15.5 } })).toThrow(/prayer.utcOffset must be/)
    expect(() => applyConfigUpdates(base, { prayer: { notify: 'yes' } })).toThrow(/prayer.notify must be a boolean/)
    expect(() => applyConfigUpdates(base, { prayer: { bogus: 1 } })).toThrow(/Unsupported prayer field/)
    expect(() => applyConfigUpdates(base, { prayer: { adjustments: { sunrise: 5 } } })).toThrow(/Unsupported prayer.adjustments field/)
    expect(() => applyConfigUpdates(base, { prayer: { adjustments: { fajr: 200 } } })).toThrow(/prayer.adjustments.fajr must be/)
  })

  test('agent notification config updates and validation', () => {
    const base = normalizeConfig()
    const agentUpdated = applyConfigUpdates(base, { agent: { notifyOnFinish: false, sound: true } })
    expect(agentUpdated.agent.notifyOnFinish).toBe(false)
    expect(agentUpdated.agent.sound).toBe(true)
    expect(() => applyConfigUpdates(base, { agent: { notifyOnFinish: 'yes' } })).toThrow(/agent.notifyOnFinish must be a boolean/)
    expect(() => applyConfigUpdates(base, { agent: { bogus: 1 } })).toThrow(/Unsupported agent field/)
  })

  test('agent permission matrix defaults on and validates', () => {
    const base = normalizeConfig()
    expect(base.agent.permissions).toEqual({ read: true, write: true, destructive: true })

    const updated = applyConfigUpdates(base, { agent: { permissions: { read: false, write: true, destructive: false } } })
    expect(updated.agent.permissions).toEqual({ read: false, write: true, destructive: false })

    expect(() => applyConfigUpdates(base, { agent: { permissions: { read: 'yes' } } })).toThrow(/agent.permissions.read must be a boolean/)
    expect(() => applyConfigUpdates(base, { agent: { permissions: 'all' } })).toThrow(/agent.permissions must be an object/)

    const partial = normalizeConfig({ agent: { permissions: { read: false } } })
    expect(partial.agent.permissions).toEqual({ read: false, write: true, destructive: true })
  })

  test('normalizeConfig clamps invalid values back to defaults', () => {
    const clamped = normalizeConfig({ prayer: { showIn: 'wat', latitude: 999, utcOffset: 99, adjustments: { isha: 999 } } })
    expect(clamped.prayer.showIn).toBe('both')
    expect(clamped.prayer.latitude).toBe(-6.2088)
    expect(clamped.prayer.utcOffset).toBe(7)
    expect(clamped.prayer.adjustments.isha).toBe(0)

    const clampedAgent = normalizeConfig({ agent: { notifyOnFinish: 'wat', sound: 42 } })
    expect(clampedAgent.agent.notifyOnFinish).toBe(true)
    expect(clampedAgent.agent.sound).toBe(false)
  })
})
