#!/usr/bin/env node
/* global setTimeout */
// Rich mock omp RPC process for screenshot capture (scripts/capture-screenshots.js).
// Speaks the same JSON-lines protocol as tests/fixtures/mock-omp-rpc.js, but
// streams a realistic turn with two tool executions so the Agent chat
// screenshot shows text, tool cards, and results in chronological order.

const readline = require('readline')

const rl = readline.createInterface({ input: process.stdin })

function send(frame) {
  process.stdout.write(JSON.stringify(frame) + '\n')
}

function respond(id, data = {}) {
  send({ type: 'response', id, success: true, data })
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
      respond(id, { sessionId: 'shot-session-1' })
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
      respond(id, { models: [{ provider: 'openai', id: 'gpt-4o', name: 'GPT-4o', input: ['text'] }] })
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

      const text1 = 'Saya lihat build storefront-web gagal di langkah lint. Biar pasti, saya cek dulu status proses dan git status-nya. '
      const text2 = 'Ketemu: ada file yang belum di-commit di src/App.tsx dan menyisakan import error. '
      const text3 = 'Mau saya commit perubahan itu dan jalankan ulang dev server-nya?'

      const tool1 = { toolCallId: 'tc-1', toolName: 'devlauncher_get_processes', args: {} }
      const end1 = {
        toolCallId: 'tc-1',
        toolName: 'devlauncher_get_processes',
        result: { content: [{ type: 'text', text: '3 processes running:\nstorefront-web (PID 1823) · api-backend (PID 1201) · admin-panel (PID 1547)' }] },
      }
      const tool2 = { toolCallId: 'tc-2', toolName: 'devlauncher_get_git_status', args: { projectId: 'storefront-web' } }
      const end2 = {
        toolCallId: 'tc-2',
        toolName: 'devlauncher_get_git_status',
        result: { content: [{ type: 'text', text: 'M src/App.tsx\n?? src/hooks/useAuth.ts' }] },
      }

      const t0 = 150
      setTimeout(() => {
        send({ type: 'agent_start' })
        send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: text1 } })
      }, t0)
      setTimeout(() => {
        send({ type: 'tool_execution_start', toolCallId: tool1.toolCallId, toolName: tool1.toolName, args: tool1.args })
      }, t0 + 900)
      setTimeout(() => {
        send({ type: 'tool_execution_end', ...end1 })
      }, t0 + 1500)
      setTimeout(() => {
        send({ type: 'tool_execution_start', toolCallId: tool2.toolCallId, toolName: tool2.toolName, args: tool2.args })
      }, t0 + 1900)
      setTimeout(() => {
        send({ type: 'tool_execution_end', ...end2 })
      }, t0 + 2500)
      setTimeout(() => {
        send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: text2 } })
      }, t0 + 2900)
      setTimeout(() => {
        send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: text3 } })
      }, t0 + 3700)
      setTimeout(() => {
        const content = text1 + text2 + text3
        send({
          type: 'agent_end',
          messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content, usage: { promptTokens: 120, completionTokens: 245, totalTokens: 365 } },
          ],
        })
      }, t0 + 4300)
      break
    }
    default:
      respond(id, { ok: true })
  }
})

rl.on('close', () => process.exit(0))

send({ type: 'ready' })
