import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { writeOmpMcpEntry, removeOmpMcpEntry, ompMcpConfigPath } from '../ompConfig'

// ompConfig resolves the config path via os.homedir(); point it at a temp dir
// per test so nothing touches the real ~/.omp/agent/mcp.json.
const { mockedHome } = vi.hoisted(() => ({ mockedHome: { value: null } }))
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, homedir: () => mockedHome.value }
})

describe('ompConfig', () => {
  let tmp

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'omp-mcp-test-'))
    mockedHome.value = tmp
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  const configFile = () => ompMcpConfigPath()

  test('writes a devlauncher http entry for the local server', () => {
    const filePath = writeOmpMcpEntry(48123, 'tok123')
    expect(filePath).toBe(configFile())
    const parsed = JSON.parse(fs.readFileSync(configFile(), 'utf8'))
    expect(parsed.mcpServers.devlauncher).toEqual({
      type: 'http',
      url: 'http://127.0.0.1:48123/mcp',
      headers: { Authorization: 'Bearer tok123' },
      timeout: 120000,
    })
  })

  test('merges without touching existing servers', () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true })
    fs.writeFileSync(configFile(), JSON.stringify({
      mcpServers: {
        unity: { type: 'stdio', command: 'unity', args: [] },
      },
    }))
    writeOmpMcpEntry(5000, 'abc')
    const parsed = JSON.parse(fs.readFileSync(configFile(), 'utf8'))
    expect(Object.keys(parsed.mcpServers).sort()).toEqual(['devlauncher', 'unity'])
    expect(parsed.mcpServers.unity.command).toBe('unity')
  })

  test('updates the devlauncher entry on re-write (port/token change)', () => {
    writeOmpMcpEntry(1000, 'one')
    writeOmpMcpEntry(2000, 'two')
    const parsed = JSON.parse(fs.readFileSync(configFile(), 'utf8'))
    expect(parsed.mcpServers.devlauncher.url).toBe('http://127.0.0.1:2000/mcp')
    expect(parsed.mcpServers.devlauncher.headers.Authorization).toBe('Bearer two')
    expect(Object.keys(parsed.mcpServers)).toEqual(['devlauncher'])
  })

  test('removeOmpMcpEntry keeps other servers', () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true })
    fs.writeFileSync(configFile(), JSON.stringify({
      mcpServers: { devlauncher: { type: 'http', url: 'x' }, vercel: { type: 'http', url: 'y' } },
    }))
    removeOmpMcpEntry()
    const parsed = JSON.parse(fs.readFileSync(configFile(), 'utf8'))
    expect(Object.keys(parsed.mcpServers)).toEqual(['vercel'])
  })

  test('removeOmpMcpEntry deletes the file when no servers remain', () => {
    writeOmpMcpEntry(1000, 'one')
    removeOmpMcpEntry()
    expect(fs.existsSync(configFile())).toBe(false)
  })

  test('removeOmpMcpEntry is a no-op when the file is missing', () => {
    expect(() => removeOmpMcpEntry()).not.toThrow()
  })

  test('tolerates an existing invalid/corrupt file (starts fresh)', () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true })
    fs.writeFileSync(configFile(), 'not json {{{')
    writeOmpMcpEntry(7000, 'fresh')
    const parsed = JSON.parse(fs.readFileSync(configFile(), 'utf8'))
    expect(parsed.mcpServers.devlauncher.url).toBe('http://127.0.0.1:7000/mcp')
  })
})
