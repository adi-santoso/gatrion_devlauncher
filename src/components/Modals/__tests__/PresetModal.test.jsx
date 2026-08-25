import React from 'react'
import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PresetModal from '../PresetModal'

const makeProjects = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `p-${index + 1}`,
    name: `Project ${index + 1}`,
    type: 'NODEJS',
  }))

const existingPreset = {
  id: 'preset-1',
  name: 'Full Stack',
  description: 'api + web',
  color: '#6D5EF5',
  projectIds: ['p-1', 'p-2', 'p-3', 'p-4'],
  startDelayMs: 1500,
  autoStart: false,
}

const checkboxFor = (name) =>
  screen.getByText(name).closest('div').querySelector('input[type="checkbox"]')

const selectedCount = () =>
  screen.getAllByRole('checkbox').filter((box) => box.checked).length

describe('PresetModal edit prefill', () => {
  test('prefills name, delay and selection from the edited preset', () => {
    render(
      <PresetModal
        isOpen
        onClose={() => {}}
        projects={makeProjects(6)}
        initialPreset={existingPreset}
        onSubmit={() => {}}
      />
    )

    expect(screen.getByLabelText(/preset name/i).value).toBe('Full Stack')
    expect(screen.getByLabelText(/stagger delay/i).value).toBe('1.5')
    expect(selectedCount()).toBe(4)
  })

  test('keeps an in-progress selection when the projects array is replaced', () => {
    // `projects` gets a brand new array reference on every metrics poll /
    // projects-updated IPC tick. That must not re-run the prefill, otherwise the
    // user's newly added project snaps back to the preset's stored 4.
    const { rerender } = render(
      <PresetModal
        isOpen
        onClose={() => {}}
        projects={makeProjects(6)}
        initialPreset={existingPreset}
        onSubmit={() => {}}
      />
    )
    expect(selectedCount()).toBe(4)

    fireEvent.click(checkboxFor('Project 5'))
    expect(selectedCount()).toBe(5)

    // Same data, new array/object identities — exactly what a status tick produces.
    rerender(
      <PresetModal
        isOpen
        onClose={() => {}}
        projects={makeProjects(6).map((p) => ({ ...p, status: 'running' }))}
        initialPreset={existingPreset}
        onSubmit={() => {}}
      />
    )

    expect(selectedCount()).toBe(5)
    expect(checkboxFor('Project 5').checked).toBe(true)
  })

  test('submits the edited selection including the newly added project', () => {
    const onSubmit = vi.fn()
    render(
      <PresetModal
        isOpen
        onClose={() => {}}
        projects={makeProjects(6)}
        initialPreset={existingPreset}
        onSubmit={onSubmit}
      />
    )

    fireEvent.click(checkboxFor('Project 5'))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].projectIds).toEqual(['p-1', 'p-2', 'p-3', 'p-4', 'p-5'])
    expect(onSubmit.mock.calls[0][0].startDelayMs).toBe(1500)
  })

  test('re-prefills when the modal is retargeted at a different preset', () => {
    const { rerender } = render(
      <PresetModal
        isOpen
        onClose={() => {}}
        projects={makeProjects(6)}
        initialPreset={existingPreset}
        onSubmit={() => {}}
      />
    )
    fireEvent.click(checkboxFor('Project 5'))
    expect(selectedCount()).toBe(5)

    rerender(
      <PresetModal
        isOpen
        onClose={() => {}}
        projects={makeProjects(6)}
        initialPreset={{ ...existingPreset, id: 'preset-2', name: 'Frontend', projectIds: ['p-6'] }}
        onSubmit={() => {}}
      />
    )

    expect(screen.getByLabelText(/preset name/i).value).toBe('Frontend')
    expect(selectedCount()).toBe(1)
  })

  test('reopening in create mode after an edit starts empty', () => {
    const { rerender } = render(
      <PresetModal
        isOpen
        onClose={() => {}}
        projects={makeProjects(6)}
        initialPreset={existingPreset}
        onSubmit={() => {}}
      />
    )
    expect(selectedCount()).toBe(4)

    // Modal closes...
    rerender(
      <PresetModal
        isOpen={false}
        onClose={() => {}}
        projects={makeProjects(6)}
        initialPreset={null}
        onSubmit={() => {}}
      />
    )
    // ...then reopens as "Create Preset".
    rerender(
      <PresetModal
        isOpen
        onClose={() => {}}
        projects={makeProjects(6)}
        initialPreset={null}
        onSubmit={() => {}}
      />
    )

    expect(screen.getByRole('heading', { name: /create preset/i })).toBeTruthy()
    expect(screen.getByLabelText(/preset name/i).value).toBe('')
    expect(selectedCount()).toBe(0)
  })

  test('a bulk preselection drops ids that are no longer known projects', () => {
    render(
      <PresetModal
        isOpen
        onClose={() => {}}
        projects={makeProjects(3)}
        initialPreset={null}
        initialSelected={['p-1', 'p-99']}
        onSubmit={() => {}}
      />
    )

    expect(selectedCount()).toBe(1)
    expect(checkboxFor('Project 1').checked).toBe(true)
  })
})
