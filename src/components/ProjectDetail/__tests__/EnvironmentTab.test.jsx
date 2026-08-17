import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EnvironmentTab from '../EnvironmentTab'

vi.mock('../../../utils/ipcRenderer', () => ({
  listEnvFiles: vi.fn(),
  readEnvFile: vi.fn(),
  writeEnvFile: vi.fn(),
}))

const ipc = await import('../../../utils/ipcRenderer')

const project = { id: 'p1', name: 'Demo', path: 'C:/demo', envVars: [] }

describe('EnvironmentTab env files', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ipc.listEnvFiles.mockResolvedValue({ success: true, files: ['.env', '.env.local'] })
    ipc.readEnvFile.mockImplementation(async (p, file) => ({
      success: true,
      fileName: file,
      content: file === '.env' ? 'APP_KEY=secret\n# comment\n' : 'LOCAL=1\n',
      modifiedAt: 1,
    }))
    ipc.writeEnvFile.mockResolvedValue({ success: true, fileName: '.env' })
  })

  it('lists env files and loads the first one, masking secret values', async () => {
    render(<EnvironmentTab project={project} />)
    await waitFor(() => expect(ipc.readEnvFile).toHaveBeenCalledWith('C:/demo', '.env'))
    expect(screen.getByLabelText('Select env file')).toBeInTheDocument()
    expect(screen.getByText('APP_KEY')).toBeInTheDocument()
    // APP_KEY is a secret-ish key → its value is masked until revealed
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
    expect(screen.getByText('•••• (6 chars)')).toBeInTheDocument()
  })

  it('reveals secret values when the toggle is on', async () => {
    render(<EnvironmentTab project={project} />)
    await waitFor(() => expect(screen.getByText('APP_KEY')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Reveal secrets'))
    expect(screen.getByText('secret')).toBeInTheDocument()
  })

  it('switches files via selector', async () => {
    render(<EnvironmentTab project={project} />)
    await waitFor(() => expect(ipc.readEnvFile).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Select env file'), { target: { value: '.env.local' } })
    await waitFor(() => expect(ipc.readEnvFile).toHaveBeenCalledWith('C:/demo', '.env.local'))
  })

  it('edits and saves file content', async () => {
    render(<EnvironmentTab project={project} />)
    await waitFor(() => expect(screen.getByText('APP_KEY')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const editor = screen.getByLabelText('Edit .env')
    fireEvent.change(editor, { target: { value: 'APP_KEY=rotated\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(ipc.writeEnvFile).toHaveBeenCalledWith('C:/demo', '.env', 'APP_KEY=rotated\n'))
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument())
  })

  it('shows empty state when no env files exist', async () => {
    ipc.listEnvFiles.mockResolvedValue({ success: true, files: [] })
    render(<EnvironmentTab project={project} />)
    await waitFor(() => expect(screen.getByText('No .env files found in this project.')).toBeInTheDocument())
  })

  it('keeps syntax highlighting visible while editing (overlay editor)', async () => {
    render(<EnvironmentTab project={project} />)
    await waitFor(() => expect(screen.getByText('APP_KEY')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    // The highlighted layer stays rendered while the textarea is transparent
    const highlight = document.querySelector('pre[aria-hidden="true"]')
    expect(highlight).toBeInTheDocument()
    expect(highlight.textContent).toContain('APP_KEY=secret')
    const editor = screen.getByLabelText('Edit .env')
    expect(editor.className).toContain('text-transparent')
    expect(editor.value).toContain('APP_KEY=secret')

    // Typing updates both layers with the same content
    fireEvent.change(editor, { target: { value: 'APP_KEY=newvalue\nNEW=1\n' } })
    expect(highlight.textContent).toContain('APP_KEY=newvalue')
  })
})
