import { describe, it, expect } from 'vitest'
import { messagesToMarkdown } from '../messagesToMarkdown'

describe('messagesToMarkdown', () => {
  it('renders user and assistant messages as labeled sections', () => {
    const markdown = messagesToMarkdown(
      [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ],
      'My chat'
    )
    expect(markdown).toContain('# My chat')
    expect(markdown).toContain('## **User**')
    expect(markdown).toContain('hello')
    expect(markdown).toContain('## **Assistant**')
    expect(markdown).toContain('world')
  })

  it('keeps message body verbatim (markdown is passed through untouched)', () => {
    const markdown = messagesToMarkdown([{ role: 'assistant', content: 'Use `npm run dev`\n\n```js\nconst a = 1\n```' }])
    expect(markdown).toContain('```js')
    expect(markdown).toContain('const a = 1')
  })

  it('tolerates empty and malformed input', () => {
    const empty = messagesToMarkdown(null, 'Empty')
    expect(empty).toContain('# Empty')

    const gaps = messagesToMarkdown([{ role: 'user', content: '' }, null, { role: 'assistant', content: 'x' }])
    expect(gaps).toContain('x')
  })

  it('falls back to a default title', () => {
    const markdown = messagesToMarkdown([{ role: 'user', content: 'hi' }])
    expect(markdown).toContain('# Conversation')
  })
})
