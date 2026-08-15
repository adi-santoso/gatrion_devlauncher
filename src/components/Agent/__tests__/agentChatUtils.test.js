import { describe, test, expect } from 'vitest'
import {
  appendTextBlock,
  appendThinkingBlock,
  blocksToSegments,
  blocksToText,
  blocksToThinking,
  extractContentParts,
  normalizeTranscriptMessage,
  argsToString,
  uid,
  cleanIpcError,
  MARKDOWN_STREAM_LIMIT,
  updateToolBlock,
} from '../agentChatUtils'

const textBlock = (text, kind = 'text') => ({ id: 'b1', kind, text })
const toolBlock = (toolId, name) => ({ id: 'b2', kind: 'tool', text: '', toolId, tool: { id: toolId, name, state: 'running' } })

describe('extractContentParts', () => {
  test('keeps plain strings as text', () => {
    expect(extractContentParts('hello world')).toEqual({ text: 'hello world', thinking: '' })
  })

  test('splits typed blocks into text and thinking', () => {
    const content = [
      { type: 'text', text: 'Answer here' },
      { type: 'thinking', text: 'Let me reason' },
      { type: 'text', text: ' more' },
    ]
    expect(extractContentParts(content)).toEqual({ text: 'Answer here more', thinking: 'Let me reason' })
  })

  test('treats unknown shapes as empty', () => {
    expect(extractContentParts(null)).toEqual({ text: '', thinking: '' })
    expect(extractContentParts(42)).toEqual({ text: '', thinking: '' })
  })
})

describe('normalizeTranscriptMessage', () => {
  test('maps a transcript entry with an omp entry id', () => {
    const message = normalizeTranscriptMessage({ id: 'entry-123', role: 'user', content: 'hi' })
    expect(message).toMatchObject({ entryId: 'entry-123', role: 'user', content: 'hi' })
    expect(message.thinking).toBeUndefined()
  })

  test('keeps trimmed thinking when present', () => {
    const message = normalizeTranscriptMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }, { type: 'thinking', text: '  reason  ' }],
    })
    expect(message.thinking).toBe('reason')
  })

  test('local entries without a string id get no entryId', () => {
    const message = normalizeTranscriptMessage({ id: 5, role: 'assistant', content: 'x' })
    expect(message.entryId).toBeUndefined()
    // Non-string ids are kept as-is (only string ids count as omp entry ids).
    expect(message.id).toBe(5)
  })
})

describe('argsToString', () => {
  test('passes strings through and compact-prints objects', () => {
    expect(argsToString('ls -la')).toBe('ls -la')
    expect(argsToString({ path: 'src' })).toBe('{"path":"src"}')
    expect(argsToString(null)).toBe('')
    expect(argsToString(undefined)).toBe('')
  })

  test('caps object serialization length', () => {
    const long = { data: 'x'.repeat(500) }
    expect(argsToString(long).length).toBeLessThanOrEqual(160)
  })
})

describe('constants', () => {
  test('uid is unique and prefixed', () => {
    expect(uid()).toMatch(/^msg-\d+-/)
    expect(uid()).not.toBe(uid())
  })

  test('MARKDOWN_STREAM_LIMIT is a positive number', () => {
    expect(MARKDOWN_STREAM_LIMIT).toBeGreaterThan(0)
  })
})

describe('turn block helpers', () => {
  test('appendTextBlock merges into the last text block and starts a new one after other kinds', () => {
    const first = appendTextBlock([], 'hello ')
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ kind: 'text', text: 'hello ' })

    const merged = appendTextBlock(first, 'world')
    expect(merged).toHaveLength(1)
    expect(merged[0].text).toBe('hello world')

    // A tool block in between forces a new text segment AFTER it
    const withTool = appendTextBlock(appendTextBlock([], 'before '), 'x')
    const interleaved = appendTextBlock([...withTool, toolBlock('t1', 'read')], 'after')
    expect(interleaved.map((block) => block.kind)).toEqual(['text', 'tool', 'text'])
    expect(interleaved[2].text).toBe('after')
  })

  test('appendThinkingBlock behaves like appendTextBlock for reasoning', () => {
    const merged = appendThinkingBlock(appendThinkingBlock([], 'step1 '), 'step2')
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ kind: 'thinking', text: 'step1 step2' })
  })

  test('updateToolBlock matches by tool id and falls back to name', () => {
    const blocks = [textBlock('intro'), toolBlock('t1', 'read'), toolBlock('t2', 'edit')]
    const byId = updateToolBlock(blocks, 't1', '', { state: 'done', body: 'ok' })
    expect(byId[1].tool).toMatchObject({ state: 'done', body: 'ok' })
    expect(byId[2].tool.state).toBe('running')

    const byName = updateToolBlock(blocks, '', 'edit', { state: 'done' })
    expect(byName[2].tool.state).toBe('done')
    expect(byName[1].tool.state).toBe('running')
  })

  test('blocksToSegments preserves chronological order and drops empty text', () => {
    const blocks = [
      textBlock('First I read the file. '),
      toolBlock('t1', 'read'),
      textBlock('Found it — editing now.'),
      textBlock('   '),
    ]
    const segments = blocksToSegments(blocks)
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'tool', 'text'])
    expect(segments[1].tool).toMatchObject({ name: 'read' })
    // Empty text blocks are dropped; the timeline keeps its order
    expect(segments[2]).toMatchObject({ kind: 'text', text: 'Found it — editing now.' })
  })

  test('blocksToText / blocksToThinking join segments in order', () => {
    const blocks = [textBlock('a'), textBlock('b'), appendThinkingBlock([], 'why')[0], textBlock('c')]
    expect(blocksToText(blocks)).toBe('a\n\nb\n\nc')
    expect(blocksToThinking(blocks)).toBe('why')
  })
})

describe('normalizeTranscriptMessage tool parts', () => {
  test('extracts interleaved tool parts into chronological segments', () => {
    const message = normalizeTranscriptMessage({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Reading now.' },
        { type: 'tool_call', id: 'tc1', name: 'read', args: { path: 'src/app.ts' } },
        { type: 'text', text: 'Found the bug.' },
      ],
    })
    expect(message.segments.map((segment) => segment.kind)).toEqual(['text', 'tool', 'text'])
    expect(message.segments[1].tool).toMatchObject({ name: 'read', state: 'done' })
  })

  test('plain text/thinking transcripts keep segments undefined', () => {
    const message = normalizeTranscriptMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }, { type: 'thinking', text: 'reason' }],
    })
    expect(message.segments).toBeUndefined()
  })
})

describe('cleanIpcError', () => {
  test('strips Electron IPC wrapper noise', () => {
    expect(
      cleanIpcError(new Error("Error invoking remote method 'omp-get-messages': Error: omp command timed out: get_messages_page"))
    ).toBe('omp command timed out: get_messages_page')
  })

  test('falls back when nothing usable is extracted', () => {
    expect(cleanIpcError(undefined, 'fallback')).toBe('fallback')
    expect(cleanIpcError('', 'fallback')).toBe('fallback')
    expect(cleanIpcError(42, 'fallback')).toBe('fallback')
    expect(cleanIpcError('   ', 'fallback')).toBe('fallback')
  })

  test('caps the message length', () => {
    expect(cleanIpcError('x'.repeat(500)).length).toBeLessThanOrEqual(300)
  })
})
