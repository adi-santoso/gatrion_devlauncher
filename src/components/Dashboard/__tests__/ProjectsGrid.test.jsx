import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProjectsGrid } from '../dashboardWidgets'

const makeProject = (i) => ({ id: `p${i}`, name: `Project ${i}`, status: 'stopped' })

const renderGrid = (projects, props = {}) =>
  render(
    <ProjectsGrid
      grouped={null}
      projects={projects}
      emptyHeading="No projects found"
      emptyHint="Add one to get started"
      showAddAction={false}
      {...props}
    />
  )

describe('ProjectsGrid show more', () => {
  it('renders everything without a Show all button when under the limit', () => {
    renderGrid(Array.from({ length: 5 }, (_, i) => makeProject(i + 1)))
    expect(screen.getByText('Project 1')).toBeTruthy()
    expect(screen.getByText('Project 5')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull()
  })

  it('caps the grid at 12 cards and offers Show all with the full count', () => {
    const projects = Array.from({ length: 15 }, (_, i) => makeProject(i + 1))
    renderGrid(projects)

    expect(screen.getByText('Project 1')).toBeTruthy()
    expect(screen.getByText('Project 12')).toBeTruthy()
    expect(screen.queryByText('Project 13')).toBeNull()
    expect(screen.getByRole('button', { name: 'Show all (15 projects)' })).toBeTruthy()
  })

  it('Show all expands to the full list and hides the button', () => {
    const projects = Array.from({ length: 15 }, (_, i) => makeProject(i + 1))
    renderGrid(projects)

    fireEvent.click(screen.getByRole('button', { name: 'Show all (15 projects)' }))

    expect(screen.getByText('Project 15')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull()
  })

  it('collapses the expansion again when the filtered set changes', () => {
    const projects = Array.from({ length: 15 }, (_, i) => makeProject(i + 1))
    const { rerender } = renderGrid(projects)

    fireEvent.click(screen.getByRole('button', { name: 'Show all (15 projects)' }))
    expect(screen.getByText('Project 15')).toBeTruthy()

    // A different filtered set (e.g. a new search query) resets to the cap.
    const rerenderGrid = (nextProjects) =>
      rerender(
        <ProjectsGrid
          grouped={null}
          projects={nextProjects}
          emptyHeading="No projects found"
          emptyHint="Add one to get started"
          showAddAction={false}
        />
      )

    rerenderGrid(projects.slice(0, 3))
    expect(screen.getByText('Project 3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull()

    // Back to a large set → capped again with the button.
    rerenderGrid(projects)
    expect(screen.getByRole('button', { name: 'Show all (15 projects)' })).toBeTruthy()
    expect(screen.queryByText('Project 15')).toBeNull()
  })

  it('still shows the empty state for an empty filtered list', () => {
    renderGrid([], { showAddAction: true })
    expect(screen.getByText('No projects found')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add Project' })).toBeTruthy()
  })
})
