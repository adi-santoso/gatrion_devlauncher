/* global getPrayerTimes, formatHour */
const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')

// Load the ES module by stripping export keywords and evaluating. Node treats
// src/*.js as CommonJS (package.json has "type": "commonjs"), so a plain
// require/import fails on the `export` syntax.
let src = fs.readFileSync(path.join(__dirname, '../../src/utils/prayerTimes.js'), 'utf8')
src = src
  .replace(/export const /g, 'const ')
  .replace(/export function /g, 'function ')
  .replace(/export \{ TIME_NAMES \};/g, '')
eval(src)

// Golden values produced by the canonical PrayTimes.js v2.3 (verified 1:1 in
// development). Each covers a different method / location / timezone.
const CASES = [
  {
    label: 'Jakarta KEMENAG', y: 2026, m: 8, d: 12, lat: -6.2088, lon: 106.8456, tz: 7, method: 'KEMENAG',
    expected: { fajr: '04:41', sunrise: '06:01', dhuhr: '11:58', asr: '15:19', maghrib: '17:55', isha: '19:06' },
  },
  {
    label: 'Jakarta MWL', y: 2026, m: 8, d: 12, lat: -6.2088, lon: 106.8456, tz: 7, method: 'MWL',
    expected: { fajr: '04:50', sunrise: '06:01', dhuhr: '11:58', asr: '15:19', maghrib: '17:55', isha: '19:02' },
  },
  {
    label: 'Jakarta ISNA', y: 2026, m: 8, d: 12, lat: -6.2088, lon: 106.8456, tz: 7, method: 'ISNA',
    expected: { fajr: '05:02', sunrise: '06:01', dhuhr: '11:58', asr: '15:19', maghrib: '17:55', isha: '18:53' },
  },
  {
    label: 'Mecca Makkah', y: 2026, m: 8, d: 12, lat: 21.3891, lon: 39.8579, tz: 3, method: 'Makkah',
    expected: { fajr: '04:37', sunrise: '05:58', dhuhr: '12:26', asr: '15:47', maghrib: '18:53', isha: '20:23' },
  },
  {
    label: 'London MWL (high-lat)', y: 2026, m: 1, d: 5, lat: 51.5074, lon: -0.1278, tz: 0, method: 'MWL',
    expected: { fajr: '06:03', sunrise: '08:05', dhuhr: '12:06', asr: '13:49', maghrib: '16:07', isha: '18:03' },
  },
  {
    label: 'Algiers MWL ref', y: 2009, m: 4, d: 22, lat: 36.720427, lon: 3.086319, tz: 1, method: 'MWL',
    expected: { fajr: '04:31', sunrise: '06:05', dhuhr: '12:46', asr: '16:30', maghrib: '19:28', isha: '20:56' },
  },
  {
    label: 'Algiers KEMENAG', y: 2009, m: 4, d: 22, lat: 36.720427, lon: 3.086319, tz: 1, method: 'KEMENAG',
    expected: { fajr: '04:19', sunrise: '06:05', dhuhr: '12:46', asr: '16:30', maghrib: '19:28', isha: '21:02' },
  },
]

for (const c of CASES) {
  const res = getPrayerTimes(new Date(c.y, c.m - 1, c.d, 12, 0, 0), c.lat, c.lon, c.tz, { method: c.method })
  for (const key of Object.keys(c.expected)) {
    assert.equal(res.formatted[key], c.expected[key], `${c.label}: ${key} mismatch`)
  }
}

// Per-prayer adjustments (tune in minutes)
const tuned = getPrayerTimes(new Date(2026, 7, 12), -6.2088, 106.8456, 7, {
  method: 'KEMENAG',
  adjustments: { fajr: 5, asr: -3 },
})
assert.equal(tuned.formatted.fajr, '04:46')
assert.equal(tuned.formatted.asr, '15:16')

// formatHour rounding matches the formatted output
assert.equal(formatHour(15.35), '15:21')
assert.equal(formatHour(0.1), '00:06')

// Unknown method falls back to KEMENAG instead of crashing
assert.equal(getPrayerTimes(new Date(2026, 7, 12), -6.2088, 106.8456, 7, { method: 'NOPE' }).formatted.dhuhr, '11:58')

console.log('Prayer times checks passed')
