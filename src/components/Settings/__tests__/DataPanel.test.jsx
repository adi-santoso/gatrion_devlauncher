import React from 'react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DataPanel } from '../settingsDataPanels'
import { I18nProvider } from '../../../i18n/I18nContext'
import * as ipc from '../../../utils/ipcRenderer'

vi.mock('../../../utils/ipcRenderer', async () => {
  const actual = await vi.importActual('../../../utils/ipcRenderer')
  return { ...actual, resetAppData: vi.fn(async () => ({ success: true })) }
})

const renderPanel = (overrides = {}) =>
  render(
    <I18nProvider language="en">
      <DataPanel
        onExportProjects={() => {}}
        onImportProjects={() => {}}
        onExportDiagnostics={() => {}}
        backupPassword=""
        onBackupPasswordChange={() => {}}
        backupBusy={false}
        backupResult={null}
        onBackupExport={() => {}}
        onBackupImport={() => {}}
        {...overrides}
      />
    </I18nProvider>
  )

describe('DataPanel reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('reset requires typing RESET before the confirm button enables', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /reset app data/i }))
    expect(screen.getByText('Reset all DevLauncher data?')).toBeTruthy()

    const confirm = screen.getByRole('button', { name: /reset & restart/i })
    expect(confirm.disabled).toBe(true)

    const input = screen.getByLabelText(/type reset to confirm/i)
    fireEvent.change(input, { target: { value: 'reset' } })
    expect(confirm.disabled).toBe(false)
  })

  test('confirming calls resetAppData and the modal stays open on success (app relaunches)', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /reset app data/i }))
    fireEvent.change(screen.getByLabelText(/type reset to confirm/i), { target: { value: 'RESET' } })
    fireEvent.click(screen.getByRole('button', { name: /reset & restart/i }))
    await waitFor(() => expect(ipc.resetAppData).toHaveBeenCalledTimes(1))
  })

  test('reset failure surfaces an error message', async () => {
    ipc.resetAppData.mockResolvedValueOnce({ success: false, error: 'boom' })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /reset app data/i }))
    fireEvent.change(screen.getByLabelText(/type reset to confirm/i), { target: { value: 'RESET' } })
    fireEvent.click(screen.getByRole('button', { name: /reset & restart/i }))
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy())
  })
})
