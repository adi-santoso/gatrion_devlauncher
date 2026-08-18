import React from 'react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProjectModal from '../ProjectModal'

vi.mock('../../../utils/ipcRenderer', async () => {
  const actual = await vi.importActual('../../../utils/ipcRenderer')
  return { ...actual, browseFolder: vi.fn(), detectProjectType: vi.fn() }
})

import * as ipc from '../../../utils/ipcRenderer'

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

const renderModal = () =>
  render(<ProjectModal isOpen onClose={() => {}} onSave={async () => ({ success: true })} />)

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
    expect(screen.getByText('goapp')).toBeTruthy()
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Go' })[0])
    fireEvent.click(screen.getByRole('menuitem', { name: /node\.js/i }))
    expect(screen.getByText('Configured as Node.js')).toBeTruthy()

    // Re-detect the same Go folder — the manual choice must survive.
    fireEvent.click(screen.getByRole('button', { name: /change folder/i }))
    await waitFor(() => {
      expect(screen.getByText('Configured as Node.js')).toBeTruthy()
    })
  })
})
