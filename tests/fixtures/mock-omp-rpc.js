#!/usr/bin/env node
// Mock omp RPC process (speaks the JSON-lines protocol of `omp --mode rpc`).
// Used by vitest (OmpManager) and Playwright e2e (agent chat) so the whole
// agent flow runs deterministically without a real LLM provider.
//
// Protocol (one JSON object per line):
//   in:  { type, id, ...args }
//   out: { type: 'response', id, success, data }  (command replies)
//        { type: 'ready' }                        (startup frame)
//        { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta } }
//        { type: 'agent_start' } / { type: 'agent_end', messages }

const readline = require('readline')

const rl = readline.createInterface({ input: process.stdin })

function send(frame) {
  process.stdout.write(JSON.stringify(frame) + '\n')
}

function respond(id, data = {}) {
  send({ type: 'response', id, success: true, data })
}

function echoMessages(prompt) {
  return [
    { role: 'user', content: prompt },
    { role: 'assistant', content: `Mock reply to: ${prompt}`, usage: { promptTokens: 100, completionTokens: 234, totalTokens: 334 } },
  ]
}

rl.on('line', (line) => {
  let frame
  try {
    frame = JSON.parse(line)
  } catch {
    return
  }
  const { type, id } = frame

  switch (type) {
    case 'get_messages_page':
      respond(id, { messages: [], nextCursor: null })
      break
    case 'get_messages':
      respond(id, { messages: [] })
      break
    case 'new_session':
      respond(id, { sessionId: 'mock-session-1' })
      break
    case 'get_state':
      respond(id, {
        sessionFile: `${process.cwd().replace(/\\/g, '/')}/.mock-session.jsonl`,
        contextUsage: { tokens: 128, contextWindow: 200000, percent: 0.001 },
        thinkingLevel: 'off',
        tokensPerSecond: 15,
        autoCompactionEnabled: false,
        fastModeEnabled: false,
        autoRetryEnabled: false,
        todoPhases: [],
      })
      break
    case 'switch_session':
      respond(id, { ok: true })
      break
    case 'get_available_models':
      respond(id, { models: [{ provider: 'mock', id: 'mock-1', name: 'Mock Model 1', input: ['text'] }] })
      break
    case 'set_model':
    case 'set_thinking_level':
    case 'set_auto_compaction':
    case 'set_auto_retry':
    case 'set_fast_mode':
    case 'steer':
    case 'abort':
    case 'compact':
    case 'get_session_commands':
      respond(id, { ok: true })
      break
    case 'prompt': {
      respond(id, { ok: true })
      const prompt = String(frame.message || '')
      // Stream the turn after a short delay so renderer-side streaming paths
      // (buffers, flush interval, token badge) are exercised for real.
      setTimeout(() => {
        send({ type: 'agent_start' })
        send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Mock reply to: ' } })
        send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: prompt } })
        send({ type: 'agent_end', messages: echoMessages(prompt) })
      }, 150)
      break
    }
    default:
      respond(id, { ok: true })
  }
})

rl.on('close', () => process.exit(0))

// Announce readiness once the stdin stream is open.
send({ type: 'ready' })
