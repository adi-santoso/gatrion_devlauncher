import { describe, test, expect } from 'vitest'
import {
  buildExecCommand,
  buildLogsCommand,
  buildRestartCommand,
  buildServicesCommand,
  cpuPercentBetween,
  parseCpuTimes,
  parseOverview,
  parseRestartResult,
  parseServices,
  quoteShellArg,
  validateCwd,
  validateServiceName,
} from '../vps/remoteCommand'
import { createBoundedBuffer, redactOutput, redactUrlCredentials } from '../vps/vpsRedact'
import { OVERVIEW_OUTPUT, SERVICES_OUTPUT } from '../../../tests/fixtures/ssh-server'

describe('remoteCommand — validation & quoting', () => {
  test('quotes arbitrary shell text with POSIX single quotes', () => {
    expect(quoteShellArg('/var/www/app')).toBe("'/var/www/app'")
    expect(quoteShellArg("it's")).toBe("'it'\\''s'")
  })

  test('rejects relative or unsafe working directories', () => {
    expect(() => validateCwd('relative/path')).toThrow(/absolute POSIX path/)
    expect(() => validateCwd('/var/www\nrm -rf /')).toThrow(/absolute POSIX path/)
    expect(validateCwd('')).toBe('')
    expect(validateCwd('/srv/app')).toBe('/srv/app')
  })

  test('validates systemd unit names', () => {
    expect(validateServiceName('nginx.service')).toBe('nginx.service')
    expect(validateServiceName('api@prod.service')).toBe('api@prod.service')
    expect(() => validateServiceName('nginx; rm -rf /')).toThrow(/Invalid service name/)
  })

  test('buildExecCommand always prefixes an explicit, quoted cwd', () => {
    expect(buildExecCommand('uptime', '/srv/app')).toBe("cd '/srv/app' && uptime")
    expect(buildExecCommand('uptime', '')).toBe('uptime')
    expect(() => buildExecCommand('', '/srv')).toThrow(/command is required/)
    expect(() => buildExecCommand('x'.repeat(9000), '')).toThrow(/too long/)
  })

  test('logs/restart/services builders never interpolate raw input', () => {
    expect(buildLogsCommand('nginx.service', 500)).toContain("journalctl -u 'nginx.service' -n 500")
    expect(buildRestartCommand('nginx.service')).toContain("systemctl restart 'nginx.service'")
    expect(buildServicesCommand()).toContain('systemctl list-units --type=service')
  })
})

describe('remoteCommand — parsers', () => {
  test('parses the overview probe into structured metrics', () => {
    const sample = parseOverview(OVERVIEW_OUTPUT)
    expect(sample.os).toBe('Fixture Linux 1.0')
    expect(sample.kernel).toBe('6.8.0-fixture')
    expect(sample.hostname).toBe('fixture-host')
    expect(sample.uptimeSec).toBe(172800)
    expect(sample.memTotalMb).toBe(2000)
    expect(sample.memUsedMb).toBe(1000)
    expect(sample.loadAvg).toEqual([0.15, 0.1, 0.05])
    expect(sample.diskUsedPercent).toBe(50)
    expect(sample.cwd).toBe('/var/www/app')
  })

  test('parses /proc/stat and computes CPU percent between samples', () => {
    const first = parseCpuTimes('cpu  100 0 50 1000 20 0 5 0 0 0')
    const second = parseCpuTimes('cpu  150 0 60 1400 20 0 5 0 0 0')
    expect(first).toEqual({ idle: 1020, total: 1175 })
    // total delta 460, idle delta 400 → 13% busy.
    expect(cpuPercentBetween(first, second)).toBe(13)
    expect(cpuPercentBetween(null, second)).toBeNull()
    expect(parseCpuTimes('not cpu')).toBeNull()
  })

  test('computes a non-zero CPU percent when work happened', () => {
    const first = parseCpuTimes('cpu  100 0 50 1000 20 0 5 0 0 0')
    const second = parseCpuTimes('cpu  200 0 100 1100 20 0 5 0 0 0')
    expect(cpuPercentBetween(first, second)).toBeGreaterThan(50)
  })

  test('parses and de-duplicates systemd service listings', () => {
    const services = parseServices(SERVICES_OUTPUT)
    expect(services.map((s) => s.name)).toEqual(['nginx.service', 'api.service', 'broken.service', 'dead.service'])
    expect(services[2]).toMatchObject({ active: 'failed', description: 'Fixture broken unit' })
  })

  test('detects a failed restart from output even when the shell exits 0', () => {
    expect(parseRestartResult('exit:0', 0)).toEqual({ ok: true, detail: 'restarted' })
    expect(parseRestartResult('Failed to restart api.service: Access denied\nexit:0', 0).ok).toBe(false)
    expect(parseRestartResult('exit:1', 1).ok).toBe(false)
  })
})

describe('vpsRedact', () => {
  test('masks secret assignments, keys and bearer tokens', () => {
    const out = redactOutput([
      'DB_PASSWORD=hunter2',
      'API_TOKEN="abc123"',
      'Authorization: Bearer abcdefghijklmnop',
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'AAAA',
      '-----END OPENSSH PRIVATE KEY-----',
    ].join('\n'))
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('abc123')
    expect(out).not.toContain('abcdefghijklmnop')
    expect(out).not.toContain('AAAA')
    expect(out).toContain('[redacted private key]')
    expect(out).toContain('DB_PASSWORD=***')
  })

  test('masks credentials inside URLs', () => {
    expect(redactUrlCredentials('postgres://admin:s3cret@db.internal/app')).toBe('postgres://admin:***@db.internal/app')
  })

  test('bounded buffer truncates but keeps head and tail', () => {
    const buffer = createBoundedBuffer(120)
    buffer.append('A'.repeat(100) + '\n')
    buffer.append('B'.repeat(200) + '\n')
    const value = buffer.value()
    expect(value.truncated).toBe(true)
    expect(value.text).toContain('output truncated')
    expect(value.text.startsWith('A')).toBe(true)
    expect(value.text.trimEnd().endsWith('B')).toBe(true)
  })

  test('withholds split secret values and private key bodies', () => {
    const buffer = createBoundedBuffer(1024)
    buffer.append('DB_PASSWORD=hunt')
    expect(buffer.value().text).not.toContain('hunt')
    buffer.append('er2\n-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA')
    buffer.append('BBBB\n-----END OPENSSH PRIVATE KEY-----\nnormal output')
    buffer.flush()
    expect(buffer.value().text).not.toContain('hunter2')
    expect(buffer.value().text).not.toContain('AAAABBBB')
    expect(buffer.value().text).toContain('DB_PASSWORD=***')
    expect(buffer.value().text).toContain('normal output')
  })
})
