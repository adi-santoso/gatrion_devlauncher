import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Markdown from '../Markdown'

describe('Markdown', () => {
  it('renders paragraphs and headings', () => {
    render(<Markdown content={'# Big title\n\nSome paragraph text\n\n## Sub title'} />)
    expect(screen.getByRole('heading', { name: 'Big title' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sub title' })).toBeInTheDocument()
    expect(screen.getByText('Some paragraph text')).toBeInTheDocument()
  })

  it('renders code fences with a copy button', () => {
    render(<Markdown content={'```js\nconst a = 1;\n```'} />)
    expect(screen.getByText('const a = 1;')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })

  it('keeps streaming-friendly unclosed fences visible as code', () => {
    render(<Markdown content={'```js\nconst half = '} />)
    expect(screen.getByText('const half =')).toBeInTheDocument()
  })

  it('renders unordered and ordered lists', () => {
    render(<Markdown content={'- one\n- two\n\n1. first\n2. second'} />)
    expect(screen.getByText('one')).toBeInTheDocument()
    expect(screen.getByText('two')).toBeInTheDocument()
    expect(screen.getByText('first')).toBeInTheDocument()
    expect(screen.getByText('second')).toBeInTheDocument()
  })

  it('renders emoji-prefixed lines as a bullet list instead of one straight paragraph', () => {
    render(<Markdown content={'✅ **Kekuatan** — clean architecture\n❌ **Kelemahan** — no tests\n⚠️ **Perhatian** — docs'} />)
    // Each emoji line is a separate <li>, not text merged into one paragraph
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    // The emoji stays visible as the item's bullet marker
    expect(screen.getByText('✅')).toBeInTheDocument()
    expect(screen.getByText('❌')).toBeInTheDocument()
    expect(screen.getByText('⚠️')).toBeInTheDocument()
    // Inline markdown inside the item still renders
    expect(screen.getByText('Kekuatan', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText(/clean architecture/)).toBeInTheDocument()
    expect(screen.getByText(/no tests/)).toBeInTheDocument()
  })

  it('parses the reported analysis layout: headings, hr, and emoji bullets stay separate blocks', () => {
    render(<Markdown content={'## **Kekuatan Project**\n\n✅ **Architecture yang clean** — separation of concerns\n✅ **Modern Vue 3 patterns** — Composition API\n\n---\n\n## **Kelemahan**\n\n❌ **No automated tests** — tidak ada unit tests'} />)
    expect(screen.getByRole('heading', { name: 'Kekuatan Project' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kelemahan' })).toBeInTheDocument()
    expect(screen.getAllByRole('list')).toHaveLength(2)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('separator')).toBeInTheDocument()
    // Bold inside the emoji item renders as inline <strong>, not literal asterisks
    expect(screen.getByText('Architecture yang clean', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText(/separation of concerns/)).toBeInTheDocument()
  })

  it('does not treat plain symbols at line start as bullets', () => {
    render(<Markdown content={'© 2026 Company — all rights reserved\n→ next steps are here'} />)
    // Both lines stay paragraph text (no <li>), and © / → are not bullets
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(/© 2026 Company/)).toBeInTheDocument()
    expect(screen.getByText(/next steps are here/)).toBeInTheDocument()
  })

  it('renders inline styles and blockquotes', () => {
    render(<Markdown content={'> quote line\n\nThis has **bold** and `code` text'} />)
    expect(screen.getByText('bold')).toBeInTheDocument()
    expect(screen.getByText('code')).toBeInTheDocument()
    expect(screen.getByText('quote line')).toBeInTheDocument()
    expect(screen.getByText(/This has/)).toBeInTheDocument()
  })

  it('renders tables', () => {
    render(<Markdown content={'| A | B |\n|---|---|\n| 1 | 2 |'} />)
    expect(screen.getByRole('columnheader', { name: 'A' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'B' })).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
