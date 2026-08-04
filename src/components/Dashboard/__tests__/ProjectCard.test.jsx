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
})
