import { describe, test, expect } from 'vitest'
import { extractContentParts, normalizeTranscriptMessage, argsToString, uid, MARKDOWN_STREAM_LIMIT } from '../agentChatUtils'

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
