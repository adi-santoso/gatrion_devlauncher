import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LaravelLogsTab from '../LaravelLogsTab'

vi.mock('../../../utils/ipcRenderer', () => ({
  listLaravelLogs: vi.fn(),
  readLaravelLog: vi.fn(),
}))

const ipc = await import('../../../utils/ipcRenderer')

const LOGS = `[2026-01-01 10:00:00] production.ERROR: Something failed {"id":1}
[2026-01-01 10:00:01] production.INFO: Everything fine
[2026-01-01 10:00:02] production.WARNING: Careful now
plain line without a level
`

describe('LaravelLogsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ipc.listLaravelLogs.mockResolvedValue({
      success: true,
      files: [
        { name: 'laravel.log', size: 2048, modifiedAt: 200 },
        { name: 'queue.log', size: 1024, modifiedAt: 100 },
      ],
    })
    ipc.readLaravelLog.mockResolvedValue({
      success: true,
      fileName: 'laravel.log',
      content: LOGS,
      lineCount: 4,
      modifiedAt: 200,
    })
  })

  it('lists log files and loads the first one', async () => {
    render(<LaravelLogsTab projectPath="C:/demo" />)
    await waitFor(() => expect(ipc.listLaravelLogs).toHaveBeenCalledWith('C:/demo'))
    await waitFor(() => expect(ipc.readLaravelLog).toHaveBeenCalledWith('C:/demo', 'laravel.log', 5000))
    expect(screen.getByLabelText('Select Laravel log file')).toBeInTheDocument()
    expect(screen.getByText(/Something failed/i)).toBeInTheDocument()
  })

  it('switches log file via selector', async () => {
    render(<LaravelLogsTab projectPath="C:/demo" />)
    await waitFor(() => expect(ipc.readLaravelLog).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Select Laravel log file'), { target: { value: 'queue.log' } })
    await waitFor(() => expect(ipc.readLaravelLog).toHaveBeenCalledWith('C:/demo', 'queue.log', 5000))
  })

  it('filters lines by search query', async () => {
    render(<LaravelLogsTab projectPath="C:/demo" />)
    await waitFor(() => expect(screen.getByText(/Something failed/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Search Laravel logs'), { target: { value: 'WARNING' } })
    expect(screen.getByText(/Careful now/i)).toBeInTheDocument()
    expect(screen.queryByText(/Everything fine/i)).not.toBeInTheDocument()
  })

  it('shows empty state when no log files exist', async () => {
    ipc.listLaravelLogs.mockResolvedValue({ success: true, files: [] })
    render(<LaravelLogsTab projectPath="C:/demo" />)
    await waitFor(() => expect(screen.getByText(/No log files/i)).toBeInTheDocument())
  })

  it('renders raw lines without a timestamp/level header', async () => {
    render(<LaravelLogsTab projectPath="C:/demo" />)
    await waitFor(() => expect(screen.getByText(/plain line without a level/i)).toBeInTheDocument())
  })

  it('reloads the current file on Reload', async () => {
    render(<LaravelLogsTab projectPath="C:/demo" />)
    await waitFor(() => expect(ipc.readLaravelLog).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /reload laravel log/i }))
    await waitFor(() => expect(ipc.readLaravelLog).toHaveBeenCalledTimes(2))
  })
})
