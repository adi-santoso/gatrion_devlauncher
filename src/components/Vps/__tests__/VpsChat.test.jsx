import React from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import VpsChat from '../VpsChat'

const state = vi.hoisted(() => ({
  prepare: vi.fn(), list: vi.fn(), create: vi.fn(), remove: vi.fn(), update: vi.fn(), config: { agent: { controlEnabled: true } },
  t: (key) => key,
}))
vi.mock('../../../i18n/I18nContext', () => ({ useI18n: () => ({ t: state.t }) }))
vi.mock('../../../hooks/useElectronConfig', () => ({ useElectronConfig: () => ({ config: state.config, updateConfig: state.update }) }))
vi.mock('../../../utils/ipcRenderer', () => ({ ompListSessions: (...args) => state.list(...args), ompCreateSession: (...args) => state.create(...args), ompDeleteSession: (...args) => state.remove(...args) }))
vi.mock('../../../data/vps', () => ({ prepareVpsScope: (...args) => state.prepare(...args) }))
vi.mock('../../Agent/AgentChat', () => ({ default: ({ project, session, onSessionCreated }) => <div>
  <div data-testid="agent-context">{session.id}:{project.path}:{session.sessionPath || 'empty'}</div>
  <button onClick={() => onSessionCreated(session.id, { ...session, sessionPath: '/transcript.jsonl' })}>save transcript</button>
</div> }))

const server = { id: 'server', name: 'Server', environment: 'staging', tags: [] }
const connection = { state: 'connected', connectedAt: 'first' }
const props = { server, status: { installed: true }, draftsRef: { current: {} }, connection }
beforeEach(() => {
  vi.clearAllMocks()
  state.config = { agent: { controlEnabled: true } }
  state.update.mockResolvedValue({ success: true })
  state.remove.mockResolvedValue({ success: true })
  state.list.mockResolvedValue({ success: true, sessions: [{ id: 'first' }, { id: 'second' }] })
  state.prepare.mockImplementation(async (_server, session) => ({ contextDir: `/context/${session}` }))
})

test('transcript metadata survives disconnect/reconnect without re-preparing mid-turn', async () => {
  const { rerender } = render(<VpsChat {...props} />)
  await screen.findByTestId('agent-context')
  const calls = state.prepare.mock.calls.length
  fireEvent.click(screen.getByText('save transcript'))
  await waitFor(() => expect(screen.getByTestId('agent-context')).toHaveTextContent('/transcript.jsonl'))
  expect(state.prepare).toHaveBeenCalledTimes(calls)
  rerender(<VpsChat {...props} connection={{ state: 'disconnected', connectedAt: null }} />)
  rerender(<VpsChat {...props} connection={{ state: 'connected', connectedAt: 'new' }} />)
  await waitFor(() => expect(screen.getByTestId('agent-context')).toHaveTextContent('first:/context/first:/transcript.jsonl'))
})

test('delete confirms the selected session and switches to the remaining session', async () => {
  render(<VpsChat {...props} />)
  await screen.findByTestId('agent-context')
  fireEvent.click(screen.getByText('vps.deleteSession'))
  expect(state.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('vps.cancel'))
  expect(state.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('vps.deleteSession'))
  fireEvent.click(screen.getByText('vps.confirmDeleteSession'))
  await waitFor(() => expect(state.remove).toHaveBeenCalledWith('vps:server', 'first'))
  await waitFor(() => expect(screen.getByTestId('agent-context')).toHaveTextContent('second:/context/second'))
  expect(screen.getAllByRole('option')).toHaveLength(1)
})

test('disabled Agent control explains the prerequisite and never creates extra sessions', async () => {
  state.config = { agent: { controlEnabled: false } }
  const { rerender } = render(<VpsChat {...props} />)
  await screen.findByText('vps.agentControlRequired')
  expect(screen.getByText('vps.newSession')).toBeDisabled()
  expect(screen.queryByText('vps.noSessionsHint')).toBeNull()
  fireEvent.click(screen.getByText('vps.enableAgentControl'))
  await waitFor(() => expect(state.update).toHaveBeenCalledWith({ agent: { controlEnabled: true } }))
  expect(state.create).not.toHaveBeenCalled()
  state.config = { agent: { controlEnabled: true } }
  rerender(<VpsChat {...props} />)
  await screen.findByTestId('agent-context')
  expect(state.create).not.toHaveBeenCalled()
})

test('scope failure retries the current session without creating another', async () => {
  state.prepare.mockResolvedValueOnce({ error: 'MCP unavailable' })
  render(<VpsChat {...props} />)
  await screen.findByText('MCP unavailable')
  expect(screen.queryByText('vps.noSessionsHint')).toBeNull()
  fireEvent.click(screen.getByText('vps.retryChat'))
  await screen.findByTestId('agent-context')
  expect(state.create).not.toHaveBeenCalled()
})

test('rapid create clicks create one session and open its chat', async () => {
  state.list.mockResolvedValue({ success: true, sessions: [] })
  let finish
  state.create.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  render(<VpsChat {...props} />)
  await screen.findByText('vps.noSessionsHint')
  const buttons = screen.getAllByText('vps.newSession')
  fireEvent.click(buttons[0])
  fireEvent.click(buttons[0])
  expect(state.create).toHaveBeenCalledTimes(1)
  finish({ success: true, session: { id: 'new-session', title: 'New' } })
  await waitFor(() => expect(screen.getByTestId('agent-context')).toHaveTextContent('new-session:/context/new-session'))
})

test('switching a session waits for its own context instead of reusing the previous one', async () => {
  render(<VpsChat {...props} />)
  await waitFor(() => expect(screen.getByTestId('agent-context')).toHaveTextContent('first:/context/first'))
  let finish
  state.prepare.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'second' } })
  expect(screen.queryByTestId('agent-context')).toBeNull()
  await waitFor(() => expect(finish).toBeDefined())
  finish({ contextDir: '/context/second' })
  await waitFor(() => expect(screen.getByTestId('agent-context')).toHaveTextContent('second:/context/second'))
})

test('disconnect removes chat execution and reconnect prepares a fresh scope', async () => {
  const { rerender } = render(<VpsChat {...props} />)
  await screen.findByTestId('agent-context')
  const before = state.prepare.mock.calls.length
  rerender(<VpsChat {...props} connection={{ state: 'disconnected', connectedAt: null }} />)
  expect(screen.queryByTestId('agent-context')).toBeNull()
  rerender(<VpsChat {...props} connection={{ state: 'connected', connectedAt: 'second' }} />)
  await screen.findByTestId('agent-context')
  expect(state.prepare.mock.calls.length).toBeGreaterThan(before)
})
