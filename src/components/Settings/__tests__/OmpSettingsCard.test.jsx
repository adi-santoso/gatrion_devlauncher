import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OmpSettingsCard from '../OmpSettingsCard'

vi.mock('../../../utils/ipcRenderer', async () => {
  const actual = await vi.importActual('../../../utils/ipcRenderer')
  return {
    ...actual,
    ompStatus: vi.fn(),
    ompInstallState: vi.fn(),
    ompConfigGet: vi.fn(),
    ompConfigSaveProvider: vi.fn(),
    ompConfigDeleteProvider: vi.fn(),
    ompConfigSetDefault: vi.fn(),
    onOmpInstallProgress: vi.fn(() => () => {}),
  }
})

import * as ipc from '../../../utils/ipcRenderer'

describe('OmpSettingsCard provider models', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ipc.ompStatus).mockResolvedValue({ success: true, installed: true, configured: true, version: '0.17.0' })
    vi.mocked(ipc.ompInstallState).mockResolvedValue({ success: true, status: 'idle' })
    vi.mocked(ipc.ompConfigGet).mockResolvedValue({
      success: true,
      defaultModel: 'my-gateway/gpt-4o-mini',
      providers: [
        {
          name: 'my-gateway',
          baseUrl: 'https://my-gateway.com/v1',
          api: 'openai-completions',
          apiKey: 'abc...xyz',
          modelCount: 2,
          models: [
            { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
            { id: 'claude-sonnet-4.5', name: 'Sonnet 4.5' },
          ],
        },
      ],
    })
  })

  test('shows the model list of a custom provider when expanded', async () => {
    render(<OmpSettingsCard />)
    await waitFor(() => expect(screen.getByText('my-gateway')).toBeInTheDocument())

    // Models are hidden until the provider row is expanded.
    expect(screen.queryByText('gpt-4o-mini')).toBeNull()

    fireEvent.click(screen.getByText('my-gateway'))

    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet-4.5')).toBeInTheDocument()
    expect(screen.getAllByText(/GPT-4o mini/).length).toBeGreaterThan(0)
  })

  test('shows a discovery hint when a provider has no explicit models', async () => {
    vi.mocked(ipc.ompConfigGet).mockResolvedValue({
      success: true,
      defaultModel: null,
      providers: [
        { name: 'auto-gateway', baseUrl: 'https://auto.example/v1', api: 'openai-completions', apiKey: '', modelCount: 'auto', models: [] },
      ],
    })
    render(<OmpSettingsCard />)
    await waitFor(() => expect(screen.getByText('auto-gateway')).toBeInTheDocument())

    fireEvent.click(screen.getByText('auto-gateway'))

    expect(await screen.findByText(/discovery/i)).toBeInTheDocument()
  })
})
