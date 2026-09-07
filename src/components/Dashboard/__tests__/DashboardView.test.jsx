import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DashboardView from '../DashboardView'

describe('DashboardView errors', () => {
  it('dismisses a project error banner', () => {
    render(<DashboardView projects={[{
      id: 'one',
      name: 'Project One',
      status: 'error',
      errorMessage: 'Port 3000 is already in use',
      startedAt: 123,
    }]} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Port 3000 is already in use')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('DashboardView last-run sorting', () => {
  const renderDashboard = (projects) => render(<DashboardView projects={projects} />)

  const projectNames = () => {
    const cards = document.querySelectorAll('article')
    return [...cards].map((card) => card.querySelector('strong')?.textContent)
  }

  const project = (id, name, overrides = {}) => ({ id, name, status: 'stopped', type: 'NODEJS', ...overrides })

  it('defaults to sorting by lastRun (most recent first, never-run last by name)', () => {
    renderDashboard([
      project('b', 'Beta', { lastRun: '2024-03-01T10:00:00.000Z' }),
      project('a', 'Alpha', { lastRun: '2024-06-01T10:00:00.000Z' }),
      project('c', 'Gamma'), // never run
      project('d', 'Delta'), // never run
    ])
    expect(projectNames()).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma'])
  })

  it('changing the sort select to Name orders alphabetically', () => {
    renderDashboard([
      project('b', 'Beta', { lastRun: '2024-03-01T10:00:00.000Z' }),
      project('a', 'Alpha', { lastRun: '2024-06-01T10:00:00.000Z' }),
    ])
    fireEvent.change(screen.getByDisplayValue('Sort by Last Run'), { target: { value: 'name' } })
    expect(projectNames()).toEqual(['Alpha', 'Beta'])
  })
})
