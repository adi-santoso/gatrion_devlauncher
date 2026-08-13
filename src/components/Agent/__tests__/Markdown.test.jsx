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
