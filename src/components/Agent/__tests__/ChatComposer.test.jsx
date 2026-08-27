import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatComposer from '../ChatComposer'

const baseProps = {
  busy: false,
  notConfigured: false,
  project: { id: 'p1', name: 'Demo' },
  attachments: [],
  setAttachments: vi.fn(),
  bashInputOpen: false,
  setBashInputOpen: vi.fn(),
  bashCommand: '',
  setBashCommand: vi.fn(),
  runBash: vi.fn(),
  fileInputRef: { current: null },
  inputRef: { current: null },
  input: '',
  setInput: vi.fn(),
  saveDraftRef: { current: null },
  resizeInput: vi.fn(),
  handleSend: vi.fn(),
  handleFiles: vi.fn(),
  slashOpen: false,
  slashMatches: [],
  insertSlashCommand: vi.fn(),
  currentModelVision: null,
}

beforeEach(() => {
  localStorage.clear()
})

describe('ChatComposer', () => {
  it('saves the current prompt as a template and reuses it later', () => {
    const setInput = vi.fn()
    const { rerender } = render(<ChatComposer {...baseProps} input="Refactor auth to use tokens" setInput={setInput} />)

    fireEvent.click(screen.getByRole('button', { name: 'Prompt templates' }))
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Auth refactor' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save current prompt' }))

    // Saving clears the input
    expect(setInput).toHaveBeenCalledWith('')
    expect(JSON.parse(localStorage.getItem('devlauncher:promptTemplates'))).toHaveLength(1)

    // Reopen the menu — the template is listed and can be inserted.
    rerender(<ChatComposer {...baseProps} input="" setInput={setInput} />)
    fireEvent.click(screen.getByRole('button', { name: 'Prompt templates' }))
    expect(screen.getByText('Auth refactor')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Auth refactor'))
    expect(setInput).toHaveBeenLastCalledWith('Refactor auth to use tokens')
  })

  it('deletes a template', () => {
    localStorage.setItem('devlauncher:promptTemplates', JSON.stringify([
      { id: '1', name: 'Bug hunt', content: 'Find the bug' },
    ]))
    render(<ChatComposer {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Prompt templates' }))
    expect(screen.getByText('Bug hunt')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete template Bug hunt' }))
    expect(screen.queryByText('Bug hunt')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('devlauncher:promptTemplates'))).toHaveLength(0)
  })

  it('shows the last turn token count and estimated cost under the composer', () => {
    render(<ChatComposer {...baseProps} lastTurn={{ tokens: 3500, cost: 0.0125 }} />)
    expect(screen.getAllByText((_, element) =>
      typeof element?.className === 'string' && element.className.includes('tabular-nums') &&
      element.textContent?.includes('last turn') &&
      /[\d,.]+ tok/.test(element.textContent) &&
      element.textContent.includes('≈$0.01')
    ).length).toBeGreaterThan(0)
  })

  it('shows a spinner with an elapsed timer while the agent is working', () => {
    render(<ChatComposer {...baseProps} busy />)
    // The busy line shows a spinner + "working" + a live mm:ss count-up.
    const busyLine = screen.getByText(/working · \d{2}:\d{2}/).closest('p')
    expect(busyLine).toBeInTheDocument()
    expect(busyLine?.querySelector('.animate-spin')).toBeTruthy()
    expect(screen.queryByText(/Agent is working/)).not.toBeInTheDocument()
  })

  it('hides the working timer when idle', () => {
    render(<ChatComposer {...baseProps} busy={false} />)
    expect(screen.queryByText(/working/)).not.toBeInTheDocument()
  })

  it('hides the last-turn line until a turn finishes', () => {
    render(<ChatComposer {...baseProps} lastTurn={null} />)
    expect(screen.queryByText(/last turn/)).not.toBeInTheDocument()
  })

  it('arrow keys move the slash-command highlight and Enter inserts the selected one', () => {
    const insertSlashCommand = vi.fn()
    const slashMatches = [
      { name: 'compact', description: 'Compact context' },
      { name: 'model', description: 'Switch model' },
      { name: 'help', description: 'Show help' },
    ]
    const { rerender } = render(
      <ChatComposer
        {...baseProps}
        input="/"
        slashOpen
        slashMatches={slashMatches}
        insertSlashCommand={insertSlashCommand}
      />
    )
    const textarea = screen.getByPlaceholderText('Describe a task, ask a question...')

    // First item is highlighted by default — Enter inserts it.
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(insertSlashCommand).toHaveBeenLastCalledWith(slashMatches[0])

    // ArrowDown moves to the second item.
    fireEvent.keyDown(textarea, { key: 'ArrowDown' })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(insertSlashCommand).toHaveBeenLastCalledWith(slashMatches[1])

    // ArrowUp wraps back to the first.
    fireEvent.keyDown(textarea, { key: 'ArrowUp' })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(insertSlashCommand).toHaveBeenLastCalledWith(slashMatches[0])

    // Tab also inserts the highlighted command.
    fireEvent.keyDown(textarea, { key: 'Tab' })
    expect(insertSlashCommand).toHaveBeenLastCalledWith(slashMatches[0])

    // The palette is a controlled popup — re-render to confirm the list renders.
    rerender(<ChatComposer {...baseProps} input="/" slashOpen slashMatches={slashMatches} insertSlashCommand={insertSlashCommand} />)
    expect(screen.getByText('/compact')).toBeInTheDocument()
  })
})
