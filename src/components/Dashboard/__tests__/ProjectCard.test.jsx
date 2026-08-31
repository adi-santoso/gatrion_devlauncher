import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectCard from '../ProjectCard'

const project = { id: 'one', name: 'Project One', status: 'stopped' }

describe('ProjectCard', () => {
  it('uses the start action for a stopped project', () => {
    const onStart = vi.fn()
    const onRestart = vi.fn()
    render(<ProjectCard project={project} onStart={onStart} onRestart={onRestart} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(onStart).toHaveBeenCalledWith(project)
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('keeps controls disabled while a project is stopping', () => {
    render(<ProjectCard project={{ ...project, status: 'stopping' }} />)

    expect(screen.getByText('Stopping')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
  })

  it('compacts a stopped card: hides N/A metric boxes and the no-activity strip', () => {
    render(<ProjectCard project={project} />)

    expect(screen.queryByText('CPU Usage')).not.toBeInTheDocument()
    expect(screen.queryByText('No live activity')).not.toBeInTheDocument()
    expect(screen.queryByText('N/A')).not.toBeInTheDocument()
  })

  it('keeps the metric boxes for a starting project', () => {
    render(<ProjectCard project={{ ...project, status: 'starting' }} />)

    expect(screen.getByText('CPU Usage')).toBeInTheDocument()
    expect(screen.getByText('Memory')).toBeInTheDocument()
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0)
  })
})
