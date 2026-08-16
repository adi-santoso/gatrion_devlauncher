import React from 'react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import McpApprovalModal from '../McpApprovalModal'
import { I18nProvider } from '../../../i18n/I18nContext'
import { onMcpApprovalRequest, respondMcpApproval } from '../../../data/agent'

vi.mock('../../../data/agent', () => ({
  onMcpApprovalRequest: vi.fn(() => () => {}),
  respondMcpApproval: vi.fn(async () => ({ success: true })),
}))

const renderModal = (language = 'en') =>
  render(<I18nProvider language={language}><McpApprovalModal /></I18nProvider>)

const request = (overrides = {}) => ({
  id: 'req-1',
  tool: 'devlauncher_delete_project',
  label: 'Hapus project dari workspace',
  projectId: 'p1',
  projectName: 'Demo',
  summary: 'Hapus "Demo" dari workspace DevLauncher.',
  args: { projectId: 'p1' },
  timestamp: '2026-08-16T00:00:00.000Z',
  ...overrides,
})

/** Push a request through the modal's subscription (same as the IPC channel). */
const push = (payload) => {
  const handler = onMcpApprovalRequest.mock.calls[0][0]
  act(() => handler(payload))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('McpApprovalModal', () => {
  test('renders nothing while there is no pending request', () => {
    renderModal()
    expect(screen.queryByText(/approval/i)).not.toBeInTheDocument()
  })

  test('shows the action, target and summary of a request', () => {
    renderModal()
    push(request())
    expect(screen.getByText('Agent action needs your approval')).toBeInTheDocument()
    expect(screen.getByText('Hapus project dari workspace')).toBeInTheDocument()
    expect(screen.getByText('Demo')).toBeInTheDocument()
    expect(screen.getByText(/Hapus "Demo" dari workspace/)).toBeInTheDocument()
  })

  test('approve responds with the request id and closes the modal', async () => {
    renderModal()
    push(request())
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(respondMcpApproval).toHaveBeenCalledWith('req-1', 'approve')
    await waitFor(() => expect(screen.queryByText('Demo')).not.toBeInTheDocument())
  })

  test('deny responds with the request id and closes the modal', async () => {
    renderModal()
    push(request())
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(respondMcpApproval).toHaveBeenCalledWith('req-1', 'deny')
    await waitFor(() => expect(screen.queryByText('Demo')).not.toBeInTheDocument())
  })

  test('shows the tool call line with args (secrets already masked main-side)', () => {
    renderModal()
    push(request({ args: { projectId: 'p1', password: '***' } }))
    expect(screen.getByText(/projectId=p1, password=\*\*\*/)).toBeInTheDocument()
  })

  test('queues concurrent requests and can deny all', async () => {
    renderModal()
    push(request({ id: 'req-1', projectName: 'Alpha' }))
    push(request({ id: 'req-2', projectName: 'Beta' }))
    // First is active, second queued.
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    expect(screen.getByText('1 more request(s) waiting')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Deny all/ }))
    expect(respondMcpApproval).toHaveBeenCalledWith('req-1', 'deny')
    expect(respondMcpApproval).toHaveBeenCalledWith('req-2', 'deny')
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument())
  })

  test('translates into Indonesian', () => {
    renderModal('id')
    push(request())
    expect(screen.getByText('Aksi agen butuh persetujuan Anda')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Setujui' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tolak' })).toBeInTheDocument()
  })
})
