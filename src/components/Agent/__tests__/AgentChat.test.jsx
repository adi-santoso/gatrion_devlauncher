import React, { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import AgentChat from '../AgentChat'

beforeAll(() => {
  // jsdom does not implement scrollIntoView
  window.Element.prototype.scrollIntoView = vi.fn()
})

const mocks = vi.hoisted(() => ({
  ompGetMessages: vi.fn(),
  ompChat: vi.fn(),
  ompAbort: vi.fn(),
  onOmpEvent: vi.fn(),
}))

let eventCb = null

vi.mock('../../../utils/ipcRenderer', () => mocks)

const project = { id: 'p1', name: 'Demo', path: 'C:/demo' }
const status = { installed: true, configured: true }

function Harness({ initialSession = null }) {
  const [session, setSession] = useState(initialSession)
  return (
    <AgentChat
      status={status}
      project={project}
      session={session}
      onSessionCreated={(sessionId, created) =>
        // Mirrors AgentView: the returned session now carries its sessionPath
        setSession({ id: sessionId, ...created, sessionPath: 'C:/sessions/s1.jsonl' })
      }
      onBusyChange={() => {}}
      onOpenSettings={() => {}}
      onTokensUsed={() => {}}
    />
  )
}

describe('AgentChat', () => {
  it('keeps the first message visible when the session is created implicitly by sending', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's1',
      session: { id: 's1', title: 'Session 1' },
    })

    render(<Harness />)

    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'hello there' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    // The user bubble must survive the session transition (null -> s1 with path)
    expect(await screen.findByText('hello there')).toBeInTheDocument()
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())
    await waitFor(() => {
      // History was NOT reloaded for the implicitly created session, so the
      // just-sent message is never wiped.
      expect(screen.getByText('hello there')).toBeInTheDocument()
    })
    expect(mocks.ompGetMessages).not.toHaveBeenCalled()
  })

  it('keeps the conversation when an existing session receives metadata updates', async () => {
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's2',
      session: { id: 's2', title: 'Session 2' },
    })

    // Pre-created session (New Session button flow): sessionPath is null until
    // the first send fills it in.
    const { rerender } = render(<Harness initialSession={{ id: 's2', title: 'Session 2', sessionPath: null }} />)

    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'keep me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('keep me')).toBeInTheDocument()
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())

    // Simulate AgentView updating the active session with its new sessionPath
    rerender(<Harness initialSession={{ id: 's2', title: 'Session 2', sessionPath: 'C:/sessions/s2.jsonl' }} />)

    // Same session id -> no reset; message and empty state stay consistent
    expect(screen.getByText('keep me')).toBeInTheDocument()
    expect(mocks.ompGetMessages).not.toHaveBeenCalled()
  })

  it('keeps earlier turns when agent_end carries only the current turn', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValueOnce({
      success: true,
      sessionId: 's3',
      session: { id: 's3', title: 'Turn 1', sessionPath: 'C:/sessions/s3.jsonl' },
    }).mockResolvedValueOnce({
      success: true,
      sessionId: 's3',
      session: { id: 's3', title: 'Turn 1', sessionPath: 'C:/sessions/s3.jsonl' },
    })

    render(<Harness />)

    const input = screen.getByPlaceholderText('Describe a task, ask a question…')

    // Turn 1
    fireEvent.change(input, { target: { value: 'first question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('first question')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalledTimes(1))
    eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
    eventCb({ projectId: 'p1', event: { type: 'agent_end', messages: [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
    ] } })
    expect(await screen.findByText('first answer')).toBeInTheDocument()
    expect(screen.getByText('first question')).toBeInTheDocument()

    // Turn 2 — agent_end only carries THIS turn's messages (turn-scoped)
    fireEvent.change(input, { target: { value: 'second question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('second question')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalledTimes(2))
    eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
    eventCb({ projectId: 'p1', event: { type: 'agent_end', messages: [
      { role: 'user', content: 'second question' },
      { role: 'assistant', content: 'second answer' },
    ] } })

    await screen.findByText('second answer')
    // Earlier turns must survive — this was the reported bug
    expect(screen.getByText('first question')).toBeInTheDocument()
    expect(screen.getByText('first answer')).toBeInTheDocument()
    expect(screen.getByText('second question')).toBeInTheDocument()
  })

  it('renders streamed deltas (buffered + flushed) without losing them', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's4',
      session: { id: 's4', title: 'Stream', sessionPath: 'C:/sessions/s4.jsonl' },
    })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'stream test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('stream test')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())

    // A burst of deltas arrives faster than renders can follow. Everything
    // (event delivery + flush interval) runs inside one act scope so the
    // timer-driven state updates are flushed to the DOM.
    await act(async () => {
      eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
      for (let i = 0; i < 50; i += 1) {
        eventCb({ projectId: 'p1', event: { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: `word${i} ` } } })
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    })
    expect(await screen.findByText(/word0/)).toBeInTheDocument()
  })

  it('streams long replies as plain text instead of re-parsing markdown per flush', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's5',
      session: { id: 's5', title: 'Long', sessionPath: 'C:/sessions/s5.jsonl' },
    })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'long stream' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('long stream')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())

    // A reply long enough to cross the markdown-streaming threshold (12k). It
    // is rendered as literal text (markdown markers stay visible) — never
    // parsed into rich elements on every flush.
    const chunk = 'lorem ipsum **not bolded** '.repeat(500) // ~13k chars
    await act(async () => {
      eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
      eventCb({ projectId: 'p1', event: { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: chunk } } })
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    expect(await screen.findByText(/\*\*not bolded\*\*/)).toBeInTheDocument()
    // The raw branch must NOT have parsed it into a <strong> element
    expect(screen.queryByText('not bolded', { selector: 'strong' })).not.toBeInTheDocument()
  })

  it('renders thinking deltas (buffered + flushed on the interval)', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's6',
      session: { id: 's6', title: 'Think', sessionPath: 'C:/sessions/s6.jsonl' },
    })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'think test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('think test')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())

    await act(async () => {
      eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
      for (let i = 0; i < 20; i += 1) {
        eventCb({ projectId: 'p1', event: { type: 'message_update', assistantMessageEvent: { type: 'reasoning_delta', delta: `step ${i} ` } } })
      }
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    fireEvent.click(await screen.findByText('Thinking'))
    expect(await screen.findByText(/step 19/)).toBeInTheDocument()
  })
})
