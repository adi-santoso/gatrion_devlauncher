import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectDetailView from '../ProjectDetailView'

vi.mock('../AppPreviewTab', () => ({
  default: ({ project, onToggleFullscreen }) => (
    <div data-testid={`preview-${project?.id}`}>
      <span>Preview {project?.name}</span>
      <button type="button" onClick={onToggleFullscreen}>toggle-fullscreen</button>
    </div>
  ),
}))

vi.mock('../LogsTab', () => ({ default: () => <div data-testid="logs-tab">Logs</div> }))
vi.mock('../CustomCommands', () => ({ default: () => null }))
vi.mock('../EnvironmentTab', () => ({ default: () => <div data-testid="env-tab">Env</div> }))
vi.mock('../SettingsTab', () => ({ default: () => <div data-testid="settings-tab">Settings</div> }))
vi.mock('../ProjectDetailHeader', () => ({ default: () => <div>Header</div> }))

const projectA = { id: 'a', name: 'Alpha', path: 'C:/alpha', type: 'NODEJS' }
const projectB = { id: 'b', name: 'Beta', path: 'C:/beta', type: 'LARAVEL' }

describe('ProjectDetailView preview mounting', () => {
  it('lazy mode unmounts the preview when switching away from the App tab', () => {
    const { rerender } = render(
      <ProjectDetailView project={projectA} keepPreviewAlive={false} projects={[projectA]} />
    )
    expect(screen.getByTestId('preview-a')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    rerender(<ProjectDetailView project={projectA} keepPreviewAlive={false} projects={[projectA]} />)
    expect(screen.queryByTestId('preview-a')).not.toBeInTheDocument()
    expect(screen.getByTestId('logs-tab')).toBeInTheDocument()
  })

  it('keep-alive mode keeps the current preview mounted (hidden) when switching tabs', () => {
    const { rerender } = render(
      <ProjectDetailView project={projectA} keepPreviewAlive projects={[projectA]} />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    rerender(<ProjectDetailView project={projectA} keepPreviewAlive projects={[projectA]} />)
    expect(screen.getByTestId('preview-a')).toBeInTheDocument()
  })

  it('keep-alive mode keeps previous projects previews mounted when switching projects', () => {
    const { rerender } = render(
      <ProjectDetailView project={projectA} keepPreviewAlive projects={[projectA, projectB]} />
    )
    expect(screen.getByTestId('preview-a')).toBeInTheDocument()

    rerender(<ProjectDetailView project={projectB} keepPreviewAlive projects={[projectA, projectB]} />)
    expect(screen.getByTestId('preview-a')).toBeInTheDocument()
    expect(screen.getByTestId('preview-b')).toBeInTheDocument()
  })

  it('keep-alive mode only mounts the current project preview when keep-alive is disabled', () => {
    const { rerender } = render(
      <ProjectDetailView project={projectA} keepPreviewAlive={false} projects={[projectA, projectB]} />
    )
    expect(screen.getByTestId('preview-a')).toBeInTheDocument()
    expect(screen.queryByTestId('preview-b')).not.toBeInTheDocument()

    rerender(<ProjectDetailView project={projectB} keepPreviewAlive={false} projects={[projectA, projectB]} />)
    expect(screen.queryByTestId('preview-a')).not.toBeInTheDocument()
    expect(screen.getByTestId('preview-b')).toBeInTheDocument()
  })
})
