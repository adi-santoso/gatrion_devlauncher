import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AppProjectDetail from '../AppProjectDetail'

vi.mock('../components/ProjectDetail/ProjectDetailView', () => ({
  default: () => <div data-testid="project-detail-view">Project detail</div>,
}))

const project = { id: 'p1', name: 'Project', path: 'C:/project', type: 'NODEJS' }

describe('AppProjectDetail lifecycle', () => {
  it('stays mounted outside Project Detail even when preview keep-alive is disabled', () => {
    render(
      <AppProjectDetail
        project={project}
        projects={[project]}
        currentView="projects"
        keepAlive={false}
        fullscreenRef={{ current: null }}
        getLogs={() => []}
        onBack={() => {}}
        onStart={() => {}}
        onStop={() => {}}
        onRestart={() => {}}
        onRemove={() => {}}
        onEdit={() => {}}
        onDuplicate={() => {}}
        onClearLogs={() => {}}
        onOpenAgent={() => {}}
        onAutoScrollChange={() => {}}
        onFullscreenChange={() => {}}
        onPrevProject={() => {}}
        onNextProject={() => {}}
        isFullscreen={false}
      />
    )

    expect(screen.getByTestId('project-detail-view')).toBeInTheDocument()
  })
})
