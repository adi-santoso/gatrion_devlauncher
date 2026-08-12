import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LogsTab from '../LogsTab'

const logs = [
  { message: 'Starting server on port 3000', level: 'info', timestamp: '2024-01-01T00:00:00Z' },
  { message: 'Failed to connect to database', level: 'error', timestamp: '2024-01-01T00:00:01Z' },
  { message: 'booting up', level: 'stderr', timestamp: '2024-01-01T00:00:02Z' },
  { message: 'warning: deprecated API', level: 'warn', timestamp: '2024-01-01T00:00:03Z' },
]

describe('LogsTab', () => {
  it('renders all logs by default', () => {
    render(<LogsTab logs={logs} />)
    expect(screen.getByText(/Starting server on port 3000/)).toBeInTheDocument()
    expect(screen.getByText(/Failed to connect to database/)).toBeInTheDocument()
  })

  it('filters by type', () => {
    render(<LogsTab logs={logs} />)
    fireEvent.change(screen.getByLabelText('Filter log type'), { target: { value: 'error' } })
    expect(screen.getByText(/Failed to connect to database/)).toBeInTheDocument()
    expect(screen.queryByText(/Starting server on port 3000/)).not.toBeInTheDocument()
  })

  it('filters by search query', () => {
    render(<LogsTab logs={logs} />)
    fireEvent.change(screen.getByLabelText('Search logs'), { target: { value: 'database' } })
    // The matched substring is wrapped in <mark>, so match across the whole line
    expect(screen.getAllByText((_, element) => element.textContent.includes('Failed to connect to database')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Starting server on port 3000/)).not.toBeInTheDocument()
  })

  it('shows empty state when no logs exist', () => {
    render(<LogsTab logs={[]} />)
    expect(screen.getByText('No logs captured yet.')).toBeInTheDocument()
  })

  it('shows a jump-to-latest button when the user scrolls away from the bottom', () => {
    render(<LogsTab logs={logs} />)
    const container = screen.getByText(/Starting server on port 3000/).closest('.overflow-y-auto')
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).not.toBeInTheDocument()

    // jsdom reports zero sizes; fake a tall scrolled container
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 200 })
    fireEvent.scroll(container, { target: { scrollTop: 0 } })
    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }))
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).not.toBeInTheDocument()
  })

  it('calls onClear when the clear button is clicked', () => {
    const onClear = vi.fn()
    render(<LogsTab logs={logs} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
