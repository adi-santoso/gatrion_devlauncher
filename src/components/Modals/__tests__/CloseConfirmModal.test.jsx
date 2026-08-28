import React from 'react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import CloseConfirmModal from '../CloseConfirmModal'
import { I18nProvider } from '../../../i18n/I18nContext'
import { onWindowCloseRequest, confirmWindowClose, cancelWindowClose } from '../../../data/config'

vi.mock('../../../data/config', () => ({
  onWindowCloseRequest: vi.fn(() => () => {}),
  confirmWindowClose: vi.fn(async () => ({ success: true })),
  cancelWindowClose: vi.fn(async () => ({ success: true })),
}))

const renderModal = (language = 'en') =>
  render(<I18nProvider language={language}><CloseConfirmModal /></I18nProvider>)

/** Push a close request through the modal's subscription (same as the IPC channel). */
const push = (payload) => {
  const handler = onWindowCloseRequest.mock.calls[0][0]
  act(() => handler(payload))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CloseConfirmModal', () => {
  test('renders nothing while there is no pending close request', () => {
    renderModal()
    expect(screen.queryByText(/quit devlauncher/i)).not.toBeInTheDocument()
  })

  test('shows a confirmation when closing with no running projects', () => {
    renderModal()
    push({ busyCount: 0 })
    expect(screen.getByText('Quit DevLauncher?')).toBeInTheDocument()
    expect(screen.getByText(/minimize to tray is off/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  test('warns when projects are still running', () => {
    renderModal()
    push({ busyCount: 2 })
    expect(screen.getByText(/2 project\(s\) are still running/i)).toBeInTheDocument()
  })

  test('Quit confirms the pending close and hides the modal', async () => {
    renderModal()
    push({ busyCount: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Quit' }))
    expect(confirmWindowClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText('Quit DevLauncher?')).not.toBeInTheDocument())
  })

  test('Cancel keeps the app open (and later closes ask again)', async () => {
    renderModal()
    push({ busyCount: 3 })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancelWindowClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText('Quit DevLauncher?')).not.toBeInTheDocument())

    // A second close raises the prompt again (fresh request from main).
    push({ busyCount: 0 })
    expect(screen.getByText('Quit DevLauncher?')).toBeInTheDocument()
  })

  test('translates into Indonesian', () => {
    renderModal('id')
    push({ busyCount: 0 })
    expect(screen.getByText('Tutup DevLauncher?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Batal' })).toBeInTheDocument()
  })
})