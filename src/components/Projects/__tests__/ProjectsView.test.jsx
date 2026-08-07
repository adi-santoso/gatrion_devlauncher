import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectsView from '../ProjectsView'

const baseProjects = [
  { id: 'a', name: 'Alpha', path: 'C:/alpha', type: 'NODEJS', status: 'stopped', port: 3000 },
  { id: 'b', name: 'Beta', path: 'C:/beta', type: 'LARAVEL', status: 'stopped', port: 8000 },
  { id: 'c', name: 'Gamma', path: 'C:/gamma', type: 'NODEJS', status: 'running', port: 5173 },
]

describe('ProjectsView', () => {
  it('scopes bulk delete to all selected projects', () => {
    const onBulkDelete = vi.fn()
    render(<ProjectsView projects={baseProjects} onBulkDelete={onBulkDelete} />)

    fireEvent.click(screen.getByLabelText('Select Alpha'))
    fireEvent.click(screen.getByLabelText('Select Beta'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected projects' }))

    expect(onBulkDelete).toHaveBeenCalledTimes(1)
    expect(onBulkDelete.mock.calls[0][0].map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('drops selection for projects hidden by filters before bulk actions', () => {
    const onBulkDelete = vi.fn()
    render(<ProjectsView projects={baseProjects} onBulkDelete={onBulkDelete} />)

    fireEvent.click(screen.getByLabelText('Select Alpha'))
    fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'LARAVEL' } })
    fireEvent.click(screen.getByLabelText('Select Beta'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected projects' }))

    expect(onBulkDelete.mock.calls[0][0].map((p) => p.id)).toEqual(['b'])
  })

  it('shows error message for errored projects', () => {
    render(<ProjectsView projects={[{ ...baseProjects[0], status: 'error', errorMessage: 'Port 3000 is already in use' }]} />)
    expect(screen.getByText('Port 3000 is already in use')).toBeInTheDocument()
  })

  it('offers force stop after stopping takes too long', () => {
    vi.useFakeTimers()
    try {
      const onForceStop = vi.fn()
      render(<ProjectsView projects={[{ ...baseProjects[0], status: 'stopping' }]} onForceStop={onForceStop} />)

      expect(screen.queryByRole('button', { name: 'Force stop Alpha' })).not.toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(11000) })
      fireEvent.click(screen.getByRole('button', { name: 'Force stop Alpha' }))
      expect(onForceStop).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('exposes secondary actions through the more menu', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<ProjectsView projects={[baseProjects[0]]} onEdit={onEdit} onDelete={onDelete} />)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Alpha' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit Project' }))
    expect(onEdit).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Alpha' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('shows a start action for stopped projects and stop/restart for running ones', () => {
    const { rerender } = render(<ProjectsView projects={[baseProjects[0]]} />)
    expect(screen.getByRole('button', { name: 'Start Alpha' })).toBeInTheDocument()

    rerender(<ProjectsView projects={[baseProjects[2]]} />)
    expect(screen.getByRole('button', { name: 'Stop Gamma' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart Gamma' })).toBeInTheDocument()
  })
})
