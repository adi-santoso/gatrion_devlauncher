import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import CommandPalette from '../CommandPalette'

const projects = [
  { id: 'p1', name: 'Alpha', path: 'C:/alpha', type: 'NODEJS', status: 'stopped', port: 3000, tags: ['frontend'], startCommand: 'npm run dev' },
  { id: 'p2', name: 'Beta', path: 'C:/beta', type: 'LARAVEL', status: 'stopped', port: 8000 },
]
const presets = [{ id: 'pr1', name: 'Full Stack', projectIds: ['p1', 'p2'] }]

const input = () => screen.getByLabelText('Search projects, sessions, files, or commands')

afterEach(() => {
  delete window.electron
})

describe('CommandPalette', () => {
  it('navigates items with arrow keys and selects with Enter', () => {
    const onSelect = vi.fn()
    render(<CommandPalette isOpen projects={projects} onSelectCommand={onSelect} />)

    // flat order: Alpha(0), Beta(1), Add New Project(2), ...
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].id).toBe('new-project')
  })

  it('selects a project with Enter after navigating to it', () => {
    const onSelect = vi.fn()
    render(<CommandPalette isOpen projects={projects} onSelectCommand={onSelect} />)

    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })

    expect(onSelect.mock.calls[0][0]).toMatchObject({ type: 'project', projectId: 'p2' })
  })

  it('filters projects by port and tag', () => {
    render(<CommandPalette isOpen projects={projects} onSelectCommand={vi.fn()} />)

    fireEvent.change(input(), { target: { value: '8000' } })
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()

    fireEvent.change(input(), { target: { value: 'frontend' } })
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })

  it('lists presets and starts one via Enter', () => {
    const onSelect = vi.fn()
    render(<CommandPalette isOpen projects={projects} presets={presets} onSelectCommand={onSelect} />)

    expect(screen.getByText('Full Stack')).toBeInTheDocument()

    // flat order: Alpha(0), Beta(1), Full Stack(2)
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })

    expect(onSelect.mock.calls[0][0]).toMatchObject({ type: 'preset', presetId: 'pr1' })
  })

  it('shows a friendly type label for projects', () => {
    render(<CommandPalette isOpen projects={projects} onSelectCommand={vi.fn()} />)
    expect(screen.queryByText('React (Vite)')).not.toBeInTheDocument()
    expect(screen.getByText('Node.js')).toBeInTheDocument()
  })

  it('closes the palette before dispatching so modal-opening commands survive', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<CommandPalette isOpen projects={projects} onSelectCommand={onSelect} onClose={onClose} />)

    fireEvent.click(screen.getByText('Add New Project'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].id).toBe('new-project')
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(onSelect.mock.invocationCallOrder[0])
  })

  it('lists agent sessions from the workspace index and selects one', async () => {
    window.electron = {
      ompListAllSessions: vi.fn().mockResolvedValue({
        success: true,
        sessions: [
          { id: 's1', projectId: 'p2', title: 'Refactor auth', tokens: 3500 },
          { id: 's2', projectId: 'p1', title: 'Setup staging', tokens: 0 },
        ],
      }),
      searchWorkspaceFiles: vi.fn().mockResolvedValue({ success: true, files: [] }),
    }
    const onSelect = vi.fn()
    render(<CommandPalette isOpen projects={projects} onSelectCommand={onSelect} />)

    const session = await screen.findByText('Refactor auth')
    expect(session).toBeInTheDocument()
    expect(screen.getByText('Setup staging')).toBeInTheDocument()
    expect(screen.getByText('3.5k tokens')).toBeInTheDocument()

    // flat order: Alpha(0), Beta(1), Refactor auth(2), Setup staging(3), ...
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0]).toMatchObject({ type: 'session', projectId: 'p2', sessionId: 's1' })
  })

  it('debounces a filename search and selects a file hit', async () => {
    window.electron = {
      ompListAllSessions: vi.fn().mockResolvedValue({ success: true, sessions: [] }),
      searchWorkspaceFiles: vi.fn().mockResolvedValue({
        success: true,
        files: [
          { path: 'C:/alpha/src/router.js', name: 'router.js', dir: 'C:/alpha/src', project: 'Alpha' },
        ],
      }),
    }
    const onSelect = vi.fn()
    render(<CommandPalette isOpen projects={projects} onSelectCommand={onSelect} />)

    // Below 2 chars: no file search yet.
    fireEvent.change(input(), { target: { value: 'r' } })
    expect(window.electron.searchWorkspaceFiles).not.toHaveBeenCalled()

    fireEvent.change(input(), { target: { value: 'router' } })
    // The name is split by the <mark> highlight, so target the mark and
    // assert the parent span carries the full name.
    const mark = await screen.findByText('router', { selector: 'mark' })
    expect(mark.parentElement.textContent).toBe('router.js')
    expect(window.electron.searchWorkspaceFiles).toHaveBeenCalledWith('router', ['C:/alpha', 'C:/beta'])

    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onSelect.mock.calls[0][0]).toMatchObject({ type: 'file', filePath: 'C:/alpha/src/router.js' })
  })
})
