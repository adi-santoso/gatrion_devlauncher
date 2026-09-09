import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectDetailView from '../ProjectDetailView'

vi.mock('../AppPreviewTab', () => ({
  default: ({ project, onToggleFullscreen, active }) => (
    <div data-testid={`preview-${project?.id}`} data-active={String(active)}>
      <span>Preview {project?.name}</span>
      <button type="button" onClick={onToggleFullscreen}>toggle-fullscreen</button>
    </div>
  ),
}))

vi.mock('../LogsTab', () => ({ default: () => <div data-testid="logs-tab">Logs</div> }))
vi.mock('../CustomCommands', () => ({ default: () => null }))
vi.mock('../../Terminal/InteractiveTerminal', () => ({ default: ({ cwd }) => <div data-testid="interactive-terminal" data-cwd={cwd}>Terminal</div> }))
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

  it('deactivates the preview while the project detail view is hidden', () => {
    const { rerender } = render(
      <ProjectDetailView project={projectA} keepPreviewAlive visible={false} projects={[projectA]} />
    )
    expect(screen.getByTestId('preview-a')).toHaveAttribute('data-active', 'false')

    rerender(<ProjectDetailView project={projectA} keepPreviewAlive visible projects={[projectA]} />)
    expect(screen.getByTestId('preview-a')).toHaveAttribute('data-active', 'true')
  })

  it('requires an explicit Start shell click; nothing auto-spawns on tab open', () => {
    const { rerender } = render(
      <ProjectDetailView project={projectA} keepPreviewAlive={false} projects={[projectA]} />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    rerender(<ProjectDetailView project={projectA} keepPreviewAlive={false} projects={[projectA]} />)
    expect(screen.queryByTestId('interactive-terminal')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start shell' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start shell' }))
    rerender(<ProjectDetailView project={projectA} keepPreviewAlive={false} projects={[projectA]} />)
    expect(screen.getAllByTestId('interactive-terminal')).toHaveLength(1)
    expect(screen.getAllByTestId('interactive-terminal')[0]).toHaveAttribute('data-cwd', 'C:/alpha')
  })

  it('hides the shell UI when the project has no path', () => {
    const { rerender } = render(
      <ProjectDetailView project={{ id: 'c', name: 'Gamma', type: 'NODEJS' }} keepPreviewAlive={false} projects={[]} />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    rerender(<ProjectDetailView project={{ id: 'c', name: 'Gamma', type: 'NODEJS' }} keepPreviewAlive={false} projects={[]} />)
    expect(screen.queryByTestId('interactive-terminal')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start shell' })).not.toBeInTheDocument()
    expect(screen.getByTestId('logs-tab')).toBeInTheDocument()
  })

  it('presents Close/Start shell per project and un-mounts on close', () => {
    const { rerender } = render(
      <ProjectDetailView project={projectA} keepPreviewAlive={false} projects={[projectA]} />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start shell' }))
    rerender(<ProjectDetailView project={projectA} keepPreviewAlive={false} projects={[projectA]} />)
    expect(screen.getAllByTestId('interactive-terminal')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Close shell' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close shell' }))
    rerender(<ProjectDetailView project={projectA} keepPreviewAlive={false} projects={[projectA]} />)
    expect(screen.queryByTestId('interactive-terminal')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start shell' })).toBeInTheDocument()
  })

  it('persists each started project shell independently across navigation', () => {
    const { rerender } = render(
      <ProjectDetailView project={projectA} keepPreviewAlive projects={[projectA, projectB]} />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start shell' }))
    rerender(<ProjectDetailView project={projectA} keepPreviewAlive projects={[projectA, projectB]} />)
    expect(screen.getAllByTestId('interactive-terminal')).toHaveLength(1)

    // Switch to B: A's shell stays mounted (hidden); B has not been started.
    rerender(<ProjectDetailView project={projectB} keepPreviewAlive projects={[projectA, projectB]} />)
    expect(screen.getAllByTestId('interactive-terminal')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Start shell' }))
    rerender(<ProjectDetailView project={projectB} keepPreviewAlive projects={[projectA, projectB]} />)
    const cwds = screen.getAllByTestId('interactive-terminal').map((el) => el.dataset.cwd)
    expect(cwds).toContain('C:/alpha')
    expect(cwds).toContain('C:/beta')

    rerender(<ProjectDetailView project={projectA} keepPreviewAlive projects={[projectA, projectB]} />)
    expect(screen.getAllByTestId('interactive-terminal')).toHaveLength(2)
  })

  it('keeps a started shell mounted while the app preview enters fullscreen', () => {
    render(
      <ProjectDetailView project={projectA} keepPreviewAlive projects={[projectA]} />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start shell' }))
    const terminal = screen.getByTestId('interactive-terminal')

    fireEvent.click(screen.getByRole('tab', { name: 'App' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle-fullscreen' }))

    expect(screen.getByTestId('interactive-terminal')).toBe(terminal)
  })

  it('unmounts a non-keep-alive preview while Project Detail is hidden', () => {
    render(
      <ProjectDetailView project={projectA} keepPreviewAlive={false} visible={false} projects={[projectA]} />
    )
    expect(screen.queryByTestId('preview-a')).not.toBeInTheDocument()
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
