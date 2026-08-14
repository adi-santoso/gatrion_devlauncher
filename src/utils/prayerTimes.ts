/**
 * Prayer time calculation — port of PrayTimes.js v2.3 (http://praytimes.org)
 * Copyright (C) 2007-2011 PrayTimes.org — developer Hamid Zarrabi-Zadeh.
 * License: GNU LGPL v3.0 (permission granted to use in any application with
 * credit + link to PrayTimes.org).
 *
 * Adapted to an ES module with:
 *  - a KEMENAG (Kementerian Agama RI) method: fajr 20°, isha 18°
 *  - per-prayer adjustments in minutes (tune)
 *  - a plain `getPrayerTimes()` API returning float hours + formatted strings
 */

const DMath = {
  dtr: (d: number) => (d * Math.PI) / 180.0,
  rtd: (r: number) => (r * 180.0) / Math.PI,
  sin: (d: number) => Math.sin(DMath.dtr(d)),
  cos: (d: number) => Math.cos(DMath.dtr(d)),
  tan: (d: number) => Math.tan(DMath.dtr(d)),
  arcsin: (d: number) => DMath.rtd(Math.asin(d)),
  arccos: (d: number) => DMath.rtd(Math.acos(d)),
  arctan: (d: number) => DMath.rtd(Math.atan(d)),
  arccot: (x: number) => DMath.rtd(Math.atan(1 / x)),
  arctan2: (y: number, x: number) => DMath.rtd(Math.atan2(y, x)),
  fixAngle: (a: number) => DMath.fix(a, 360),
  fixHour: (a: number) => DMath.fix(a, 24),
  fix: (a: number, b: number) => {
    a = a - b * Math.floor(a / b)
    return a < 0 ? a + b : a
  },
}

export const TIME_NAMES = ['imsak', 'fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha', 'midnight'] as const

/** Supported calculation methods. KEMENAG is the official RI standard (fajr 20°, isha 18°). */
export const METHODS = {
  KEMENAG: { name: 'Kemenag RI', params: { fajr: 20, isha: 18 } },
  MWL: { name: 'Muslim World League', params: { fajr: 18, isha: 17 } },
  ISNA: { name: 'ISNA (North America)', params: { fajr: 15, isha: 15 } },
  Egypt: { name: 'Egyptian General Authority', params: { fajr: 19.5, isha: 17.5 } },
  Makkah: { name: 'Umm Al-Qura, Makkah', params: { fajr: 18.5, isha: '90 min' } },
  Karachi: { name: 'Univ. of Islamic Sciences, Karachi', params: { fajr: 18, isha: 18 } },
  Tehran: { name: 'Institute of Geophysics, Tehran', params: { fajr: 17.7, isha: 14, maghrib: 4.5, midnight: 'Jafari' } },
  Jafari: { name: 'Shia Ithna-Ashari, Qum', params: { fajr: 16, isha: 14, maghrib: 4, midnight: 'Jafari' } },
} as const

export type PrayerMethodKey = keyof typeof METHODS

type MethodParamValue = number | string

const DEFAULT_PARAMS: Record<string, MethodParamValue> = { maghrib: '0 min', midnight: 'Standard' }
const SETTING_DEFAULTS: Record<string, MethodParamValue> = { imsak: '10 min', dhuhr: '0 min', asr: 'Standard', highLats: 'NightMiddle' }

const evalNum = (str: string | number): number => Number((str + '').split(/[^0-9.+-]/)[0]) || 0
const isMin = (arg: string | number): boolean => (arg + '').indexOf('min') !== -1

function julian(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1
    month += 12
  }
  const A = Math.floor(year / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5
}

interface SunPosition {
  declination: number
  equation: number
}

function sunPosition(jd: number): SunPosition {
  const D = jd - 2451545.0
  const g = DMath.fixAngle(357.529 + 0.98560028 * D)
  const q = DMath.fixAngle(280.459 + 0.98564736 * D)
  const L = DMath.fixAngle(q + 1.915 * DMath.sin(g) + 0.020 * DMath.sin(2 * g))
  const e = 23.439 - 0.00000036 * D
  const RA = DMath.arctan2(DMath.cos(e) * DMath.sin(L), DMath.cos(L)) / 15
  const eqt = q / 15 - DMath.fixHour(RA)
  const decl = DMath.arcsin(DMath.sin(e) * DMath.sin(L))
  return { declination: decl, equation: eqt }
}

interface TimeTable {
  imsak: number
  fajr: number
  sunrise: number
  dhuhr: number
  asr: number
  sunset: number
  maghrib: number
  isha: number
  [key: string]: number
}

export interface PrayerAdjustments {
  fajr?: number
  dhuhr?: number
  asr?: number
  maghrib?: number
  isha?: number
}

export interface PrayerOptions {
  method?: string
  elevation?: number
  adjustments?: PrayerAdjustments
}

export interface PrayerTimesResult {
  fajr: number
  sunrise: number
  dhuhr: number
  asr: number
  maghrib: number
  isha: number
  formatted: Record<string, string>
}

/**
 * Calculate prayer times for a given date and location.
 *
 * @param date - any date-like value (only its local Y/M/D matter)
 * @param latitude
 * @param longitude
 * @param utcOffset - fixed UTC offset in hours (already includes DST), e.g. 7 for WIB
 * @param options - method, elevation, per-prayer adjustments
 * @returns times are float hours in the local wall clock (24h range)
 */
export function getPrayerTimes(date: Date | string, latitude: number, longitude: number, utcOffset: number, options: PrayerOptions = {}): PrayerTimesResult {
  const method = (options.method && methodExists(options.method)) ? options.method : 'KEMENAG'
  const params = METHODS[method as PrayerMethodKey].params as Record<string, MethodParamValue>
  const setting: Record<string, MethodParamValue> = { ...SETTING_DEFAULTS }
  for (const id of Object.keys(params)) setting[id] = params[id]
  // fill method defaults (maghrib/midnight)
  for (const id of Object.keys(DEFAULT_PARAMS)) {
    if (setting[id] === undefined) setting[id] = DEFAULT_PARAMS[id]
  }

  const d = date instanceof Date ? date : new Date(date)
  const lat = Number(latitude)
  const lng = Number(longitude)
  const elv = Number.isFinite(options.elevation) ? (options.elevation as number) : 0
  const timeZone = Number(utcOffset) || 0
  const jDate = julian(d.getFullYear(), d.getMonth() + 1, d.getDate()) - lng / (15 * 24)

  // --- helpers bound to this computation ---
  const midDay = (time: number): number => {
    const eqt = sunPosition(jDate + time).equation
    return DMath.fixHour(12 - eqt)
  }

  const sunAngleTime = (angle: number, time: number, direction?: string): number => {
    const decl = sunPosition(jDate + time).declination
    const noon = midDay(time)
    const t = (1 / 15) * DMath.arccos(
      (-DMath.sin(angle) - DMath.sin(decl) * DMath.sin(lat)) / (DMath.cos(decl) * DMath.cos(lat))
    )
    return noon + (direction === 'ccw' ? -t : t)
  }

  const asrTime = (factor: number, time: number): number => {
    const decl = sunPosition(jDate + time).declination
    const angle = -DMath.arccot(factor + DMath.tan(Math.abs(lat - decl)))
    return sunAngleTime(angle, time)
  }

  const asrFactor = (asrParam: string | number): number => {
    const factor = { Standard: 1, Hanafi: 2 }[asrParam as string]
    return factor || evalNum(asrParam)
  }

  const riseSetAngle = (): number => 0.833 + 0.0347 * Math.sqrt(elv)

  // --- compute (following the canonical computePrayerTimes/computeTimes) ---
  let times: TimeTable = { imsak: 5, fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 }
  // day portion (hours -> fraction of day)
  for (const id of Object.keys(times)) times[id] /= 24

  const computePrayerTimes = (t: TimeTable): TimeTable => {
    const imsak = sunAngleTime(evalNum(setting.imsak), t.imsak, 'ccw')
    const fajr = sunAngleTime(evalNum(setting.fajr), t.fajr, 'ccw')
    const sunrise = sunAngleTime(riseSetAngle(), t.sunrise, 'ccw')
    const dhuhr = midDay(t.dhuhr)
    const asr = asrTime(asrFactor(setting.asr), t.asr)
    const sunset = sunAngleTime(riseSetAngle(), t.sunset)
    const maghrib = sunAngleTime(evalNum(setting.maghrib), t.maghrib)
    const isha = sunAngleTime(evalNum(setting.isha), t.isha)
    return { imsak, fajr, sunrise, dhuhr, asr, sunset, maghrib, isha }
  }

  // main iterations (canonical default numIterations = 1)
  times = computePrayerTimes(times)

  // adjustTimes
  const adjustTimes = (t: TimeTable): TimeTable => {
    for (const id of Object.keys(t)) t[id] += timeZone - lng / 15
    if (setting.highLats !== 'None') t = adjustHighLats(t)
    if (isMin(setting.imsak)) t.imsak = t.fajr - evalNum(setting.imsak) / 60
    if (isMin(setting.maghrib)) t.maghrib = t.sunset + evalNum(setting.maghrib) / 60
    if (isMin(setting.isha)) t.isha = t.maghrib + evalNum(setting.isha) / 60
    t.dhuhr += evalNum(setting.dhuhr) / 60
    return t
  }

  const adjustHighLats = (t: TimeTable): TimeTable => {
    const nightTime = timeDiff(t.sunset, t.sunrise)
    t.imsak = adjustHLTime(t.imsak, t.sunrise, evalNum(setting.imsak), nightTime, 'ccw')
    t.fajr = adjustHLTime(t.fajr, t.sunrise, evalNum(setting.fajr), nightTime, 'ccw')
    t.isha = adjustHLTime(t.isha, t.sunset, evalNum(setting.isha), nightTime)
    t.maghrib = adjustHLTime(t.maghrib, t.sunset, evalNum(setting.maghrib), nightTime)
    return t
  }

  const adjustHLTime = (time: number, base: number, angle: number, night: number, direction?: string): number => {
    const portion = nightPortion(angle, night)
    const diff = direction === 'ccw' ? timeDiff(time, base) : timeDiff(base, time)
    if (Number.isNaN(time) || diff > portion) {
      return base + (direction === 'ccw' ? -portion : portion)
    }
    return time
  }

  const nightPortion = (angle: number, night: number): number => {
    let portion = 1 / 2 // MidNight
    if (setting.highLats === 'AngleBased') portion = (1 / 60) * angle
    if (setting.highLats === 'OneSeventh') portion = 1 / 7
    return portion * night
  }

  const timeDiff = (time1: number, time2: number): number => DMath.fixHour(time2 - time1)

  times = adjustTimes(times)

  // midnight
  times.midnight = setting.midnight === 'Jafari'
    ? times.sunset + timeDiff(times.sunset, times.fajr) / 2
    : times.sunset + timeDiff(times.sunset, times.sunrise) / 2

  // tune (per-prayer adjustments in minutes)
  const adjustments: PrayerAdjustments = options.adjustments && typeof options.adjustments === 'object' ? options.adjustments : {}
  const tuneKey: Record<string, keyof PrayerAdjustments> = { fajr: 'fajr', dhuhr: 'dhuhr', asr: 'asr', maghrib: 'maghrib', isha: 'isha' }
  for (const key of Object.keys(tuneKey)) {
    const mins = adjustments[tuneKey[key]]
    if (Number.isFinite(mins)) times[key] += Number(mins) / 60
  }

  const pad = (n: number): string => (n < 10 ? '0' + n : String(n))
  const format24 = (time: number): string => {
    if (Number.isNaN(time)) return '-----'
    const fixed = DMath.fixHour(time + 0.5 / 60) // round to nearest minute
    const hours = Math.floor(fixed)
    const minutes = Math.floor((fixed - hours) * 60)
    return pad(hours) + ':' + pad(minutes)
  }

  return {
    fajr: times.fajr,
    sunrise: times.sunrise,
    dhuhr: times.dhuhr,
    asr: times.asr,
    maghrib: times.maghrib,
    isha: times.isha,
    formatted: {
      imsak: format24(times.imsak),
      fajr: format24(times.fajr),
      sunrise: format24(times.sunrise),
      dhuhr: format24(times.dhuhr),
      asr: format24(times.asr),
      maghrib: format24(times.maghrib),
      isha: format24(times.isha),
    },
  }
}

/** Narrow helper — treat an arbitrary method string as a known key when it exists. */
function methodExists(method: string): boolean {
  return Object.prototype.hasOwnProperty.call(METHODS, method)
}

/** Format a float hour (e.g. 15.35) as "HH:MM" using the same rounding as the calculation. */
export function formatHour(hours: number): string {
  if (Number.isNaN(hours)) return '-----'
  const fixed = DMath.fixHour(hours + 0.5 / 60)
  const h = Math.floor(fixed)
  const m = Math.floor((fixed - h) * 60)
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}
