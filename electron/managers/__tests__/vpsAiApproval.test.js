import { test, expect, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import http from 'http'
import { parseAiDecision, reviewVpsOperation } from '../vps/vpsAiApproval'

const mock = path.resolve(__dirname, '../../../tests/fixtures/mock-vps-reviewer.cjs')
const input = { tool: 'vps_exec', args: { command: 'uptime' }, server: { environment: 'development' }, scopeId: 'test' }
afterEach(() => {
  delete process.env.VPS_REVIEW_TEST_ANSWER
  delete process.env.VPS_REVIEW_TEST_HANG
  delete process.env.DEVLAUNCHER_VPS_TOKEN
})
test('review decisions require a boolean and nonempty reason', () => {
  expect(parseAiDecision('{"approved":false,"reason":"Not authorized"}').approved).toBe(false)
  expect(() => parseAiDecision('{"approved":"yes","reason":"ok"}')).toThrow()
  expect(() => parseAiDecision('I approve')).toThrow()
  expect(() => parseAiDecision('{"approved":true,"reason":""}')).toThrow()
})
test('independent reviewer returns approve/deny and receives no executor token', async () => {
  process.env.DEVLAUNCHER_VPS_TOKEN = 'must-never-reach-reviewer'
  process.env.VPS_REVIEW_TEST_ANSWER = '{"approved":true,"reason":"Requested read command"}'
  expect(await reviewVpsOperation(null, mock, input, [{ role: 'user', content: 'Check uptime' }])).toEqual({ approved: true, reason: 'Requested read command' })
  process.env.VPS_REVIEW_TEST_ANSWER = '{"approved":false,"reason":"Denied"}'
  expect((await reviewVpsOperation(null, mock, input, [])).approved).toBe(false)
})
test('invalid AI output and timeout deny instead of executing', async () => {
  process.env.VPS_REVIEW_TEST_ANSWER = 'maybe'
  expect((await reviewVpsOperation(null, mock, input, [])).approved).toBe(false)
  process.env.VPS_REVIEW_TEST_HANG = '1'
  expect(await reviewVpsOperation(null, mock, input, [], 1200)).toEqual({ approved: false, reason: 'AI approval timed out' })
})

const realBinary = process.env.OMP_BINARY || path.join(process.env.LOCALAPPDATA || '', 'omp', 'omp.exe')
test.skipIf(!fs.existsSync(realBinary))('real omp engine reviews with a local model fixture and no active tools', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-review-engine-'))
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR
  let calls = 0
  let toolCount = 0
  let approved = true
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      if (!body) { res.writeHead(405); res.end(); return }
      const request = JSON.parse(body)
      calls++
      toolCount += (request.tools || []).length
      res.setHeader('Content-Type', 'text/event-stream')
      const decision = JSON.stringify({ approved, reason: approved ? 'Requested uptime' : 'Unrequested change' })
      const frame = (delta, finish_reason) => JSON.stringify({ id: 'review', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })
      res.write(`data: ${frame({ role: 'assistant', content: decision }, null)}\n\n`)
      res.write(`data: ${frame({}, 'stop')}\n\n`)
      res.end('data: [DONE]\n\n')
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  fs.writeFileSync(path.join(dir, 'models.yml'), JSON.stringify({ providers: { 'review-fixture': {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture',
    models: [{ id: 'fixture', name: 'Fixture', reasoning: false, input: ['text'], contextWindow: 32768, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  } } }))
  fs.writeFileSync(path.join(dir, 'config.yml'), JSON.stringify({ modelRoles: { default: 'review-fixture/fixture' } }))
  process.env.PI_CODING_AGENT_DIR = dir
  try {
    expect(await reviewVpsOperation(realBinary, null, input, [{ role: 'user', content: 'Check uptime' }])).toEqual({ approved: true, reason: 'Requested uptime' })
    approved = false
    expect((await reviewVpsOperation(realBinary, null, input, [])).approved).toBe(false)
    expect(calls).toBe(2)
    expect(toolCount).toBe(0)
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}, 30000)
