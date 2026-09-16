import React, { StrictMode } from 'react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProjectModal from '../ProjectModal'

vi.mock('../../../data/projects', async () => {
  const actual = await vi.importActual('../../../data/projects')
  return { ...actual, browseFolder: vi.fn(), detectProjectType: vi.fn() }
})

import * as ipc from '../../../data/projects'

const goDetection = {
  success: true,
  type: 'GOLANG',
  name: 'Go',
  projectName: 'goapp',
  packageManager: null,
  defaultCommand: 'go run .',
  defaultPort: null,
  commands: [{ id: 'main', name: 'Go', command: 'go run .', port: null, primary: true }],
  icon: '🐹',
  color: '#00ADD8',
  warnings: [],
}

const nodeDetection = {
  success: true,
  type: 'NODEJS',
  name: 'Node.js',
  projectName: 'nodeapp',
  packageManager: 'npm',
  defaultCommand: 'npm start',
  defaultPort: 3000,
  commands: [{ id: 'main', name: 'Node.js', command: 'npm start', port: 3000, primary: true }],
  icon: '🟩',
  color: '#339933',
  warnings: [],
}

const renderModal = (overrides = {}) =>
  render(
    <ProjectModal isOpen onClose={() => {}} onSave={async () => ({ success: true })} {...overrides} />
  )

const openAdvancedAfterBrowse = async () => {
  fireEvent.click(screen.getByRole('button', { name: /browse project folder/i }))
  await waitFor(() => expect(screen.getByText('Detected as Go')).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /advanced settings/i }))
}

describe('ProjectModal folder detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ipc.browseFolder).mockResolvedValue({ success: true, path: 'D:/projects/goapp' })
    vi.mocked(ipc.detectProjectType).mockResolvedValue(goDetection)
  })

  test('first Browse applies the detected type instead of staying CUSTOM', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /browse project folder/i }))

    await waitFor(() => {
      // Bug: EMPTY_PROJECT.type is 'CUSTOM', so the first detection was treated
      // as a manual edit and never applied → "Configured as Custom".
      expect(screen.getByText('Detected as Go')).toBeTruthy()
    })
    expect(ipc.detectProjectType).toHaveBeenCalledWith('D:/projects/goapp')
    // Detected defaults land in the form
    expect(screen.getByText('go run .')).toBeTruthy()
    expect(screen.getByLabelText(/Project name/)).toHaveValue('goapp')
  })

  test('Change folder re-detects and updates the type on a second browse', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /browse project folder/i }))
    await waitFor(() => expect(screen.getByText('Detected as Go')).toBeTruthy())

    vi.mocked(ipc.detectProjectType).mockResolvedValue(nodeDetection)
    fireEvent.click(screen.getByRole('button', { name: /change folder/i }))

    await waitFor(() => expect(screen.getByText('Detected as Node.js')).toBeTruthy())
    expect(screen.getByText('npm start')).toBeTruthy()
  })

  test('a manually chosen type is preserved when the folder is re-detected', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /browse project folder/i }))
    await waitFor(() => expect(screen.getByText('Detected as Go')).toBeTruthy())

    // Open Advanced Settings and pick Node.js manually.
    fireEvent.click(screen.getByRole('button', { name: /advanced settings/i }))
    // The dropdown wrapper (role=button) precedes its inner trigger button.
    fireEvent.change(screen.getByLabelText('Project type'), { target: { value: 'NODEJS' } })
    expect(screen.getByText('Configured as Node.js')).toBeTruthy()

    // Re-detect the same Go folder — the manual choice must survive.
    fireEvent.click(screen.getByRole('button', { name: /change folder/i }))
    await waitFor(() => {
      expect(screen.getByText('Configured as Node.js')).toBeTruthy()
    })
  })

  test('a tag typed without Enter is still saved (blur/save commit regression)', async () => {
    const onSave = vi.fn(async () => ({ success: true }))
    renderModal({ onSave })
    await openAdvancedAfterBrowse()

    const input = screen.getByPlaceholderText(/add tag/i)
    fireEvent.change(input, { target: { value: 'backend' } })
    // No Enter — click Add Project directly.
    fireEvent.click(screen.getByRole('button', { name: /add project/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].tags).toContain('backend')
  })

  test('Enter commits a tag as a chip and it is saved', async () => {
    const onSave = vi.fn(async () => ({ success: true }))
    renderModal({ onSave })
    await openAdvancedAfterBrowse()

    const input = screen.getByPlaceholderText(/add tag/i)
    fireEvent.change(input, { target: { value: 'api' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('api')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /add project/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].tags).toContain('api')
  })

  test('detection applies the type under React.StrictMode double-invoked updaters', async () => {
    // Regression: analyzeFolder used to write lastDetected inside the
    // setFormData updater. React StrictMode (dev) invokes updater functions
    // twice; the second run then saw updated refs and SKIPped the type, leaving
    // the form as "Configured as Custom" in npm run dev. The merge now happens
    // outside the updater, so this must hold even with double invocation.
    render(
      <StrictMode>
        <ProjectModal isOpen onClose={() => {}} onSave={async () => ({ success: true })} />
      </StrictMode>
    )
    fireEvent.click(screen.getByRole('button', { name: /browse project folder/i }))

    await waitFor(() => {
      expect(screen.getByText('Detected as Go')).toBeTruthy()
      expect(screen.getByText('go run .')).toBeTruthy()
    })
  })

  test('a dropped folder with pre-detected type is applied, not stuck as CUSTOM', async () => {
    // Regression: drag & drop calls detectProjectType before opening the modal,
    // so droppedProject arrives with a non-empty type. applyDetection must treat
    // that prefill as "detected", not as a manual edit that blocks overwriting.
    renderModal({
      droppedProject: {
        path: 'D:/projects/goapp',
        name: 'goapp',
        type: 'GOLANG',
        startCommand: 'go run .',
        commands: [{ id: 'main', name: 'Go', command: 'go run .', port: null, primary: true }],
      },
    })
    // The dropped prefill is shown as the configured stack (the drop handler
    // already ran detection before opening the modal).
    expect(screen.getByText(/Configured as Go/)).toBeTruthy()

    // Re-analyze the same folder — the dropped prefill must be overwritable.
    vi.mocked(ipc.detectProjectType).mockResolvedValue(nodeDetection)
    fireEvent.click(screen.getByRole('button', { name: /change folder/i }))
    await waitFor(() => expect(screen.getByText('Detected as Node.js')).toBeTruthy())
    expect(screen.getByText('npm start')).toBeTruthy()
  })

  test('existing tags from other projects render as selectable chips', async () => {
    const onSave = vi.fn(async () => ({ success: true }))
    const allProjects = [
      { id: 'p-x', name: 'Existing', type: 'NODEJS', tags: ['backend', 'api'] },
    ]
    renderModal({ onSave, allProjects })
    await openAdvancedAfterBrowse()

    const chip = screen.getByRole('button', { name: 'backend' })
    expect(chip).toBeTruthy()
    fireEvent.click(chip)
    fireEvent.click(screen.getByRole('button', { name: /add project/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].tags).toContain('backend')
  })

  test('additional process can be removed, keeping only the primary command', async () => {
    const onSave = vi.fn(async () => ({ success: true }))
    vi.mocked(ipc.detectProjectType).mockResolvedValue({
      success: true,
      type: 'LARAVEL',
      name: 'Laravel',
      projectName: 'laravel-app',
      packageManager: 'npm',
      defaultCommand: 'php artisan serve',
      defaultPort: 8000,
      commands: [
        { id: 'app', name: 'Laravel', command: 'php artisan serve', port: 8000, primary: true },
        { id: 'assets', name: 'Frontend assets', command: 'npm run dev', port: 5173, primary: false },
      ],
      icon: '🔴',
      color: '#FF2D20',
      warnings: [],
    })
    renderModal({ onSave })
    fireEvent.click(screen.getByRole('button', { name: /browse project folder/i }))
    await waitFor(() => expect(screen.getByText('Detected as Laravel')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /advanced settings/i }))

    // The additional process is shown in the detection summary.
    expect(screen.getAllByText('Frontend assets').length).toBeGreaterThanOrEqual(1)
    const remove = screen.getByRole('button', { name: /remove additional process/i })
    expect(remove).toBeTruthy()
    fireEvent.click(remove)
    expect(screen.queryByText('Frontend assets')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /add project/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const commands = onSave.mock.calls[0][0].commands
    expect(commands).toHaveLength(1)
    expect(commands[0].id).toBe('app')
    expect(commands[0].primary).toBe(true)
  })

  test('preview host selector defaults to localhost and can switch to 127.0.0.1', async () => {
    const onSave = vi.fn(async () => ({ success: true }))
    renderModal({ onSave })
    await openAdvancedAfterBrowse()

    // Both buttons exist
    expect(screen.getByText('localhost')).toBeTruthy()
    expect(screen.getByText('127.0.0.1')).toBeTruthy()

    // Default is localhost (active state)
    const localhost = screen.getByRole('button', { name: 'localhost' })
    expect(localhost.className).toContain('bg-accent/15')

    // Switch to 127.0.0.1
    fireEvent.click(screen.getByRole('button', { name: '127.0.0.1' }))

    fireEvent.click(screen.getByRole('button', { name: /add project/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].previewHost).toBe('127.0.0.1')
  })
})
