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
//        { type: 'extension_ui_request', id, method, ... }  (dialog)
//
// Behaviour switches (via prompt keywords, so e2e can drive them):
//   - prompt containing "CONFIRM" -> emit a confirm extension_ui_request before
//     completing the turn; the turn only finishes after the host responds with
//     extension_ui_response { confirmed: true }.
//   - prompt containing "INPUT"   -> emit an input extension_ui_request before
//     completing the turn; the turn uses the returned value in its reply.
//   - prompt containing "CRASH"   -> emit agent_start then exit(1) so the host's
//     auto-restart path is exercised.
//   - prompt containing "PASSIVE" -> emit passive UI frames that must never
//     block the turn or open an input dialog.

const readline = require('readline')
const fs = require('fs')
const persistHistory = process.env.OMP_RPC_MOCK_PERSIST_HISTORY === '1'
let sessionFile = `${process.cwd().replace(/\\/g, '/')}/.mock-session.jsonl`
const readHistory = () => {
  if (!persistHistory || !fs.existsSync(sessionFile)) return []
  return JSON.parse(fs.readFileSync(sessionFile, 'utf8'))
}

const rl = readline.createInterface({ input: process.stdin })

// Pending extension UI requests keyed by their request id -> method. The mock
// records the response it receives so tests can assert on the round-trip.
const pendingExtUi = new Map()
const extensionUiResponses = []
let guidedTurn = null

function send(frame) {
  process.stdout.write(JSON.stringify(frame) + '\n')
}

function respond(id, data = {}) {
  send({ type: 'response', id, success: true, data })
}

function echoMessages(prompt, extra = '') {
  return [
    { role: 'user', content: prompt },
    { role: 'assistant', content: `Mock reply to: ${prompt}${extra}`, usage: { promptTokens: 100, completionTokens: 234, totalTokens: 334 } },
  ]
}

function streamTurn(prompt, extra = '') {
  send({ type: 'agent_start' })
  send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Mock reply to: ' } })
  send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: prompt } })
  if (extra) send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: extra } })
  const messages = echoMessages(prompt, extra)
  if (persistHistory) fs.writeFileSync(sessionFile, JSON.stringify([...readHistory(), ...messages]))
  send({ type: 'agent_end', messages })
}

rl.on('line', (line) => {
  let frame
  try {
    frame = JSON.parse(line)
  } catch {
    return
  }
  const { type, id } = frame

  // Extension UI responses arrive as side-channel frames (no request id).
  if (type === 'extension_ui_response') {
    extensionUiResponses.push(frame)
    const pending = pendingExtUi.get(frame.id)
    if (pending) {
      pendingExtUi.delete(frame.id)
      if (pending.method === 'confirm' && frame.confirmed) {
        streamTurn(pending.prompt, ' (confirmed)')
      } else if (pending.method === 'input') {
        streamTurn(pending.prompt, ` (input=${frame.value})`)
      } else {
        // Cancelled or unknown: complete with a cancelled marker.
        streamTurn(pending.prompt, ' (cancelled)')
      }
    }
    return
  }

  switch (type) {
    case 'get_messages_page':
      respond(id, { messages: readHistory(), nextCursor: null })
      break
    case 'get_messages':
      respond(id, { messages: readHistory() })
      break
    case 'new_session':
      if (persistHistory) fs.writeFileSync(sessionFile, '[]')
      respond(id, { sessionId: 'mock-session-1' })
      break
    case 'get_state':
      respond(id, {
        sessionFile,
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
      if (persistHistory && frame.sessionPath) sessionFile = frame.sessionPath
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
    case 'compact':
    case 'get_session_commands':
    case 'follow_up':
    case 'set_session_name':
    case 'set_host_tools':
    case 'set_todos':
      respond(id, { ok: true })
      break
    case 'steer': {
      if (!guidedTurn) { respond(id, { ok: true }); break }
      const text = String(frame.message || '')
      if (text.includes('FAIL_ONCE') && !guidedTurn.rejected) {
        guidedTurn.rejected = true
        send({ type: 'response', id, success: false, error: 'Mock delivery failed' })
        break
      }
      const turn = guidedTurn
      turn.messages.push({ role: 'user', content: text })
      setTimeout(() => {
        respond(id, { ok: true })
        send({ type: 'tool_execution_end', toolCallId: 'guided-tool', toolName: 'bash', result: { content: [{ text: 'Command completed' }] } })
        const reply = `Guidance received: ${text}`
        send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: reply } })
        turn.messages.push({ role: 'assistant', content: reply })
        if (text.includes('FINISH')) {
          send({ type: 'agent_end', messages: turn.messages })
          guidedTurn = null
        }
      }, 300)
      break
    }
    case 'abort':
      respond(id, { ok: true })
      if (guidedTurn) { send({ type: 'agent_end', messages: guidedTurn.messages }); guidedTurn = null }
      // Real omp tells the host to close pending extension UI by emitting a
      // fresh cancel control frame that points at the original request ID.
      for (const targetId of pendingExtUi.keys()) {
        pendingExtUi.delete(targetId)
        send({ type: 'extension_ui_request', id: `cancel-${targetId}`, method: 'cancel', targetId })
      }
      break
    case 'get_session_stats':
      respond(id, { tokens: 334, cost: 0.01, model: 'mock-1', contextUsage: { tokens: 128, contextWindow: 200000 } })
      break
    case 'prompt': {
      respond(id, { ok: true })
      const prompt = String(frame.message || '')
      if (prompt.includes('GUIDED_TASK')) {
        const content = Array.from({ length: 24 }, (_, index) => `Progress item ${index + 1}: preparing the project.`).join('\n\n')
        guidedTurn = { messages: [{ role: 'user', content: prompt }, { role: 'assistant', content }], rejected: false }
        send({ type: 'agent_start' })
        send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: content } })
        send({ type: 'tool_execution_start', toolCallId: 'guided-tool', toolName: 'bash', args: { command: 'mock build' } })
        break
      }
      if (prompt.includes('CRASH')) {
        send({ type: 'agent_start' })
        // Exit abruptly so the host's auto-restart path is exercised.
        setTimeout(() => process.exit(1), 100)
        break
      }
      if (prompt.includes('PASSIVE')) {
        send({ type: 'extension_ui_request', id: `notify-${Date.now()}`, method: 'notify', message: 'Mock passive notification', notifyType: 'info' })
        send({ type: 'extension_ui_request', id: `status-${Date.now()}`, method: 'setStatus', statusKey: 'mock', statusText: 'Working' })
        send({ type: 'extension_ui_request', id: `widget-${Date.now()}`, method: 'setWidget', widgetKey: 'mock', widgetLines: ['Working'] })
        setTimeout(() => streamTurn(prompt), 50)
        break
      }
      if (prompt.includes('CONFIRM') || prompt.includes('INPUT')) {
        // Ask for user input before completing the turn. The turn resumes when
        // the host answers with extension_ui_response.
        const method = prompt.includes('INPUT') ? 'input' : 'confirm'
        const extId = `ext-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        pendingExtUi.set(extId, { method, prompt })
        send({
          type: 'extension_ui_request',
          id: extId,
          method,
          title: method === 'input' ? 'Mock input request' : 'Mock confirm request',
          message: method === 'input' ? 'Enter a value' : 'Do you approve this action?',
          placeholder: 'Type something…',
        })
        break
      }
      // Stream the turn after a short delay so renderer-side streaming paths
      // (buffers, flush interval, token badge) are exercised for real.
      setTimeout(() => streamTurn(prompt), 150)
      break
    }
    default:
      respond(id, { ok: true })
  }
})

rl.on('close', () => process.exit(0))

// Announce readiness once the stdin stream is open.
send({ type: 'ready' })
