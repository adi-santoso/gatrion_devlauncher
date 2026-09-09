import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import OmpExtensionUiModal from '../OmpExtensionUiModal'
import { I18nProvider } from '../../../i18n/I18nContext'
import { onOmpEvent, onOmpExtensionUiRequest, respondExtensionUi } from '../../../data/agent'
import { openExternalUrl } from '../../../data/config'

vi.mock('../../../data/agent', () => ({
  onOmpExtensionUiRequest: vi.fn(() => () => {}),
  onOmpEvent: vi.fn(() => () => {}),
  respondExtensionUi: vi.fn(async () => ({ success: true })),
}))

vi.mock('../../../data/config', () => ({
  openExternalUrl: vi.fn(async () => ({ success: true })),
}))

const renderModal = (onNotify = vi.fn()) => ({
  onNotify,
  ...render(
    <I18nProvider language="en">
      <OmpExtensionUiModal onNotify={onNotify} />
    </I18nProvider>,
  ),
})

const push = (request, projectId = 'project-1') => {
  const calls = onOmpExtensionUiRequest.mock.calls
  const handler = calls[calls.length - 1][0]
  act(() => handler({ projectId, request }))
}

const pushLifecycle = (event, projectId = 'project-1') => {
  const calls = onOmpEvent.mock.calls
  const handler = calls[calls.length - 1][0]
  act(() => handler({ projectId, event }))
}

const confirmRequest = (overrides = {}) => ({
  type: 'extension_ui_request',
  id: 'ui-1',
  method: 'confirm',
  title: 'Confirm action',
  message: 'Continue?',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  respondExtensionUi.mockResolvedValue({ success: true })
  openExternalUrl.mockResolvedValue({ success: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('OmpExtensionUiModal protocol handling', () => {
  test('shows only genuinely interactive requests', () => {
    renderModal()
    push(confirmRequest())

    expect(screen.getByText('Confirm action')).toBeInTheDocument()
    expect(screen.getByText('Continue?')).toBeInTheDocument()
  })

  test.each(['setStatus', 'setWidget', 'setTitle', 'set_editor_text'])(
    'ignores passive %s frames without sending a response',
    (method) => {
      renderModal()
      push({ id: `passive-${method}`, method, message: 'not a dialog' })

      expect(screen.queryByText('Agent needs your input')).not.toBeInTheDocument()
      expect(respondExtensionUi).not.toHaveBeenCalled()
    },
  )

  test('maps passive notify frames to an app toast without opening a modal', () => {
    const onNotify = vi.fn()
    renderModal(onNotify)
    push({ id: 'notify-1', method: 'notify', message: 'Background task finished', notifyType: 'warning' })

    expect(onNotify).toHaveBeenCalledWith('warning', 'Background task finished')
    expect(screen.queryByText('Agent needs your input')).not.toBeInTheDocument()
    expect(respondExtensionUi).not.toHaveBeenCalled()
  })

  test('uses cancel targetId to close the matching request instead of opening another modal', () => {
    renderModal()
    push(confirmRequest())
    expect(screen.getByText('Confirm action')).toBeInTheDocument()

    push({ id: 'cancel-frame-1', method: 'cancel', targetId: 'ui-1' })

    expect(screen.queryByText('Confirm action')).not.toBeInTheDocument()
    expect(screen.queryByText('Agent needs your input')).not.toBeInTheDocument()
    expect(respondExtensionUi).not.toHaveBeenCalled()
  })

  test('scopes cancel targetId to the project that emitted it', () => {
    renderModal()
    push(confirmRequest(), 'project-1')
    push({ id: 'cancel-frame-1', method: 'cancel', targetId: 'ui-1' }, 'project-2')

    expect(screen.getByText('Confirm action')).toBeInTheDocument()
  })

  test.each(['agent_end', 'rpc_exit', 'rpc_error', 'rpc_restarting'])(
    'clears stale project dialogs on %s',
    (type) => {
      renderModal()
      push(confirmRequest())

      pushLifecycle({ type })

      expect(screen.queryByText('Confirm action')).not.toBeInTheDocument()
    },
  )

  test('deduplicates replayed request IDs per project', async () => {
    renderModal()
    push(confirmRequest())
    push(confirmRequest())

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(screen.queryByText('Confirm action')).not.toBeInTheDocument())
    expect(respondExtensionUi).toHaveBeenCalledTimes(1)
  })

  test('keeps the dialog open when its response fails so the user can retry', async () => {
    respondExtensionUi.mockResolvedValueOnce({ success: false, error: 'pipe write failed' })
    renderModal()
    push(confirmRequest())

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('pipe write failed')
    expect(screen.getByText('Confirm action')).toBeInTheDocument()
  })

  test('drops a stale dialog when the omp process no longer exists', async () => {
    respondExtensionUi.mockResolvedValueOnce({ success: false, error: 'omp process is not running' })
    const onNotify = vi.fn()
    renderModal(onNotify)
    push(confirmRequest())

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByText('Confirm action')).not.toBeInTheDocument())
    expect(onNotify).toHaveBeenCalledWith('warning', 'omp process is not running')
  })

  test('expires timed dialogs locally and sends the timedOut response shape', async () => {
    vi.useFakeTimers()
    renderModal()
    push(confirmRequest({ timeout: 1000 }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(respondExtensionUi).toHaveBeenCalledWith('project-1', {
      id: 'ui-1',
      cancelled: true,
      timedOut: true,
    })
  })

  test('opens open_url requests safely without sending a protocol response', async () => {
    renderModal()
    push({ id: 'url-1', method: 'open_url', url: 'https://example.com/login' })

    fireEvent.click(screen.getByRole('button', { name: 'Open link' }))

    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/login')
    await waitFor(() => expect(screen.queryByText('Open link in your browser?')).not.toBeInTheDocument())
    expect(respondExtensionUi).not.toHaveBeenCalled()
  })
})
