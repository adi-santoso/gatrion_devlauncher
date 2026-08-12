import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CommandPalette from '../CommandPalette'

const projects = [
  { id: 'p1', name: 'Alpha', path: 'C:/alpha', type: 'NODEJS', status: 'stopped', port: 3000, tags: ['frontend'], startCommand: 'npm run dev' },
  { id: 'p2', name: 'Beta', path: 'C:/beta', type: 'LARAVEL', status: 'stopped', port: 8000 },
]
const presets = [{ id: 'pr1', name: 'Full Stack', projectIds: ['p1', 'p2'] }]

const input = () => screen.getByLabelText('Search projects, presets, or commands')

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
})
