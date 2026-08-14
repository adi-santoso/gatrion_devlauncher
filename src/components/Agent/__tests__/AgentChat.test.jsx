import React, { useEffect, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentChat from '../AgentChat'

beforeAll(() => {
  // jsdom does not implement scrollIntoView
  window.Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  mocks.ompConfigGet.mockResolvedValue({ success: true, providers: [], defaultModel: null })
  mocks.ompConfigSetDefault.mockResolvedValue({ success: true })
  mocks.ompSetModel.mockResolvedValue({ success: true })
  mocks.ompGetModels.mockResolvedValue({ success: true, models: [] })
  mocks.ompSetThinkingLevel.mockResolvedValue({ success: true })
  mocks.ompGetState.mockResolvedValue({ success: true, state: { thinkingLevel: 'off' } })
  mocks.ompSteer.mockResolvedValue({ success: true })
  mocks.ompGetCommands.mockResolvedValue({ success: true, commands: [] })
  mocks.ompCompact.mockResolvedValue({ success: true })
  mocks.ompSetAutoCompaction.mockResolvedValue({ success: true })
  mocks.ompSetAutoRetry.mockResolvedValue({ success: true })
  mocks.ompSetFastMode.mockResolvedValue({ success: true })
  mocks.ompExportConversation.mockResolvedValue({ success: true, canceled: true })
  mocks.ompHandoff.mockResolvedValue({ success: true })
  mocks.ompSetSubagentSubscription.mockResolvedValue({ success: true })
  mocks.ompGetSubagents.mockResolvedValue({ success: true, subagents: [] })
  mocks.ompBash.mockResolvedValue({ success: true, data: { output: 'done', exitCode: 0 } })
  mocks.ompAbortBash.mockResolvedValue({ success: true })
  mocks.ompBranch.mockResolvedValue({ success: true, data: { text: '', cancelled: false } })
  mocks.getConfig.mockResolvedValue({ success: true, config: { agent: { notifyOnFinish: true }, notifications: { sound: false } } })
  mocks.updateConfig.mockResolvedValue({ success: true, config: {} })
  mocks.showNotification.mockResolvedValue({ success: true })
})

const mocks = vi.hoisted(() => ({
  ompGetMessages: vi.fn(),
  ompChat: vi.fn(),
  ompAbort: vi.fn(),
  onOmpEvent: vi.fn(),
  ompConfigGet: vi.fn(),
  ompConfigSetDefault: vi.fn(),
  ompSetModel: vi.fn(),
  ompGetModels: vi.fn(),
  ompSetThinkingLevel: vi.fn(),
  ompGetState: vi.fn(),
  ompSteer: vi.fn(),
  ompGetCommands: vi.fn(),
  ompCompact: vi.fn(),
  ompSetAutoCompaction: vi.fn(),
  ompSetAutoRetry: vi.fn(),
  ompSetFastMode: vi.fn(),
  ompExportConversation: vi.fn(),
  ompHandoff: vi.fn(),
  ompSetSubagentSubscription: vi.fn(),
  ompGetSubagents: vi.fn(),
  ompBash: vi.fn(),
  ompAbortBash: vi.fn(),
  ompBranch: vi.fn(),
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  showNotification: vi.fn(),
}))

let eventCb = null

vi.mock('../../../utils/ipcRenderer', () => mocks)

const project = { id: 'p1', name: 'Demo', path: 'C:/demo' }
const status = { installed: true, configured: true }

function Harness({ initialSession = null }) {
  const [session, setSession] = useState(initialSession)
  // Keep the session in sync when the parent re-renders with a different one
  useEffect(() => { setSession(initialSession) }, [initialSession])
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

  it('pauses streaming renders while the view is hidden and flushes everything on return', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 'sHidden',
      session: { id: 'sHidden', title: 'Hidden', sessionPath: 'C:/sessions/sHidden.jsonl' },
    })

    function HiddenHarness({ visible }) {
      const [session, setSession] = useState(null)
      return (
        <AgentChat
          visible={visible}
          status={status}
          project={project}
          session={session}
          onSessionCreated={(sessionId, created) =>
            setSession({ id: sessionId, ...created, sessionPath: 'C:/sessions/sHidden.jsonl' })
          }
          onBusyChange={() => {}}
          onOpenSettings={() => {}}
          onTokensUsed={() => {}}
        />
      )
    }

    const { rerender } = render(<HiddenHarness visible={false} />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'hidden stream' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('hidden stream')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())

    // The whole reply streams while the user is on another menu (view hidden):
    // deltas accumulate in the buffer but must NOT re-render the hidden chat
    // (that is what starved the renderer and froze the visible view).
    await act(async () => {
      eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
      for (let i = 0; i < 20; i += 1) {
        eventCb({ projectId: 'p1', event: { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: `hidden word${i} ` } } })
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    })
    expect(screen.queryByText(/hidden word0/)).not.toBeInTheDocument()

    // Returning to the Agent view flushes the whole accumulated reply at once
    rerender(<HiddenHarness visible={true} />)
    expect(await screen.findByText(/hidden word19/)).toBeInTheDocument()
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
    // Auto-opens while streaming — reasoning is visible without clicking
    expect(await screen.findByText(/step 19/)).toBeInTheDocument()
    // Clicking collapses it to a preview snippet instead of hiding everything
    fireEvent.click(screen.getByText('Thought process'))
    expect(screen.queryByText(/step 19/)).not.toBeInTheDocument()
  })

  it('persists thinking on the assistant message after the turn ends (open by default, collapsible with preview)', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's8',
      session: { id: 's8', title: 'Persist', sessionPath: 'C:/sessions/s8.jsonl' },
    })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'think again' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('think again')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())

    await act(async () => {
      eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
      for (let i = 0; i < 20; i += 1) {
        eventCb({ projectId: 'p1', event: { type: 'message_update', assistantMessageEvent: { type: 'reasoning_delta', delta: `step ${i} ` } } })
      }
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    // agent_end transcript has NO thinking parts — the streamed thinking must
    // be carried over from the live state onto the final assistant message.
    eventCb({ projectId: 'p1', event: { type: 'agent_end', messages: [
      { role: 'user', content: 'think again' },
      { role: 'assistant', content: 'done thinking' },
    ] } })

    expect(await screen.findByText('done thinking')).toBeInTheDocument()
    // Open by default (kreova behavior) — the full reasoning stays visible
    expect(await screen.findByText(/step 19/)).toBeInTheDocument()
    // Collapsing shows a preview snippet instead of nothing
    fireEvent.click(screen.getByText('Thought process'))
    expect(screen.queryByText(/step 19/)).not.toBeInTheDocument()
    expect(screen.getByText(/step 0/)).toBeInTheDocument()
    // Expanding reveals the full reasoning again
    fireEvent.click(screen.getByText('Thought process'))
    expect(await screen.findByText(/step 19/)).toBeInTheDocument()
  })

  it('shows in/out token usage on the assistant message from agent_end', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's9',
      session: { id: 's9', title: 'Usage', sessionPath: 'C:/sessions/s9.jsonl' },
    })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'tokens please' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('tokens please')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())

    eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
    eventCb({ projectId: 'p1', event: { type: 'agent_end', messages: [
      { role: 'user', content: 'tokens please' },
      { role: 'assistant', content: 'here you go', usage: { promptTokens: 100, completionTokens: 250, totalTokens: 350 } },
    ] } })

    expect(await screen.findByText(/100 in · 250 out/)).toBeInTheDocument()
  })

  it('retries the last assistant reply by re-asking the same prompt', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's10',
      session: { id: 's10', title: 'Retry', sessionPath: 'C:/sessions/s10.jsonl' },
    })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'fix the bug' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('fix the bug')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalledTimes(1))
    eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
    eventCb({ projectId: 'p1', event: { type: 'agent_end', messages: [
      { role: 'user', content: 'fix the bug' },
      { role: 'assistant', content: 'ok fixed' },
    ] } })
    await screen.findByText('ok fixed')

    fireEvent.click(screen.getByTitle('Retry — re-ask the last prompt'))

    // Old reply is dropped, the same prompt is re-sent as a new turn
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalledTimes(2))
    expect(mocks.ompChat).toHaveBeenLastCalledWith('p1', 'C:/demo', 'fix the bug', expect.anything())
    expect(screen.queryByText('ok fixed')).not.toBeInTheDocument()
  })

  it('edits the last user message and re-asks with the corrected prompt', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's11',
      session: { id: 's11', title: 'Edit', sessionPath: 'C:/sessions/s11.jsonl' },
    })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'old question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('old question')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalledTimes(1))
    eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
    eventCb({ projectId: 'p1', event: { type: 'agent_end', messages: [
      { role: 'user', content: 'old question' },
      { role: 'assistant', content: 'old answer' },
    ] } })
    await screen.findByText('old answer')

    fireEvent.click(screen.getByTitle('Edit and re-ask'))
    const editor = screen.getByDisplayValue('old question')
    fireEvent.change(editor, { target: { value: 'new question' } })
    fireEvent.click(screen.getByText('Save & send'))

    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalledTimes(2))
    expect(mocks.ompChat).toHaveBeenLastCalledWith('p1', 'C:/demo', 'new question', expect.anything())
    expect(screen.getByText('new question')).toBeInTheDocument()
    // The old reply is dropped together with everything after the edited message
    expect(screen.queryByText('old answer')).not.toBeInTheDocument()
  })

  it('keeps partial content when generation is stopped', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's12',
      session: { id: 's12', title: 'Stop', sessionPath: 'C:/sessions/s12.jsonl' },
    })
    mocks.ompAbort.mockResolvedValue({ success: true })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'stop me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('stop me')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())

    await act(async () => {
      eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
      eventCb({ projectId: 'p1', event: { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'partial content ' } } })
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    expect(mocks.ompAbort).toHaveBeenCalledWith('p1', 'C:/demo')
    expect(await screen.findByText(/partial content/)).toBeInTheDocument()
    expect(screen.getByText(/Generation stopped/)).toBeInTheDocument()
  })

  it('lists discovery-based models from the running omp and switches the model from the chat header', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    // The provider discovers models at runtime — models.yml has no explicit
    // list, so the picker must fall back to get_available_models.
    mocks.ompConfigGet.mockResolvedValue({ success: true, providers: [], defaultModel: 'kreova/kiro-claude-sonnet-4.5:high' })
    mocks.ompGetModels.mockResolvedValue({ success: true, models: [
      { id: 'kiro-claude-sonnet-4.5', name: 'kiro-claude-sonnet-4.5', provider: 'kreova' },
      { id: 'kiro-haiku-4.5', name: 'kiro-haiku-4.5', provider: 'kreova' },
    ] })

    render(<Harness />)

    // Default carries a :high variant — still matched to the base model ref
    expect(await screen.findByText(/kiro-claude-sonnet-4\.5/)).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Switch model'))
    fireEvent.click(await screen.findByText('kreova · kiro-haiku-4.5'))

    expect(mocks.ompConfigSetDefault).toHaveBeenCalledWith('kreova/kiro-haiku-4.5')
    await waitFor(() => {
      expect(mocks.ompSetModel).toHaveBeenCalledWith('p1', 'C:/demo', 'kreova', 'kiro-haiku-4.5')
    })
  })

  it('shows a character counter while typing a long message', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    const longText = 'a'.repeat(1234)
    fireEvent.change(input, { target: { value: longText } })

    // Locale-agnostic match: the thousands separator differs per OS locale
    expect(await screen.findByText(/1\D?234 chars/)).toBeInTheDocument()
  })

  it('filters models with the dropdown search box', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompConfigGet.mockResolvedValue({ success: true, providers: [], defaultModel: null })
    mocks.ompGetModels.mockResolvedValue({ success: true, models: [
      { id: 'kiro-claude-sonnet-4.5', name: 'kiro-claude-sonnet-4.5', provider: 'kreova' },
      { id: 'kiro-haiku-4.5', name: 'kiro-haiku-4.5', provider: 'kreova' },
      { id: 'kiro-deepseek-3.2', name: 'kiro-deepseek-3.2', provider: 'kreova' },
    ] })

    render(<Harness />)
    fireEvent.click(await screen.findByTitle('Switch model'))

    // All three visible initially
    expect(await screen.findByText('kreova · kiro-claude-sonnet-4.5')).toBeInTheDocument()
    expect(screen.getByText('kreova · kiro-haiku-4.5')).toBeInTheDocument()

    // Type in the search box → only matching models remain
    fireEvent.change(screen.getByPlaceholderText('Search models…'), { target: { value: 'haiku' } })
    expect(screen.getByText('kreova · kiro-haiku-4.5')).toBeInTheDocument()
    expect(screen.queryByText('kreova · kiro-claude-sonnet-4.5')).not.toBeInTheDocument()

    // No match → empty state
    fireEvent.change(screen.getByPlaceholderText('Search models…'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No models match/)).toBeInTheDocument()
  })

  it('sets the thinking level from the chat header', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompGetState.mockResolvedValue({ success: true, state: { thinkingLevel: 'off' } })

    render(<Harness />)

    // Current level read from get_state
    fireEvent.click(await screen.findByTitle('Thinking level'))
    fireEvent.click(await screen.findByText('High'))

    await waitFor(() => {
      expect(mocks.ompSetThinkingLevel).toHaveBeenCalledWith('p1', 'C:/demo', 'high')
    })
  })

  it('attaches an image, warns when the model lacks vision, and sends it as omp ImageContent', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's7',
      session: { id: 's7', title: 'Img', sessionPath: 'C:/sessions/s7.jsonl' },
    })
    // Active model is text-only (input: ['text']) → vision warning expected
    mocks.ompConfigGet.mockResolvedValue({ success: true, providers: [], defaultModel: 'kreova/kiro-claude-sonnet-4.5:high' })
    mocks.ompGetModels.mockResolvedValue({ success: true, models: [
      { id: 'kiro-claude-sonnet-4.5', name: 'kiro-claude-sonnet-4.5', provider: 'kreova', input: ['text'] },
    ] })

    // jsdom has no canvas and never decodes images — fake both so the
    // attachment helper resolves (it falls back to the original bytes).
    const originalFileReader = global.FileReader
    const originalImage = global.Image
    global.FileReader = class {
      readAsDataURL() {
        this.result = 'data:image/png;base64,QUJDRA=='
        queueMicrotask(() => this.onload?.())
      }
    }
    global.Image = class {
      get width() { return 800 }
      get height() { return 600 }
      set src(_value) { queueMicrotask(() => this.onload?.()) }
    }

    try {
      render(<Harness />)

      const fileInput = document.querySelector('input[type=file]')
      const file = new File(['abc'], 'shot.png', { type: 'image/png' })
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } })
      })

      // Thumbnail preview appears with a remove button
      expect(await screen.findByAltText('shot.png')).toBeInTheDocument()
      expect(screen.getByTitle('Remove image')).toBeInTheDocument()
      // The active model is text-only → warn before sending
      expect(await screen.findByText(/may not support images/)).toBeInTheDocument()

      const input = screen.getByPlaceholderText('Describe a task, ask a question…')
      fireEvent.change(input, { target: { value: 'what is in this image?' } })
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

      await waitFor(() => {
        expect(mocks.ompChat).toHaveBeenCalledWith('p1', 'C:/demo', 'what is in this image?', expect.objectContaining({
          images: [{ type: 'image', data: 'QUJDRA==', mimeType: 'image/png' }],
        }))
      })
      // The sent message renders the thumbnail; clicking expands it fullscreen
      expect(await screen.findByAltText('Attachment')).toBeInTheDocument()
      fireEvent.click(screen.getByAltText('Attachment'))
      expect(screen.getByAltText('Expanded')).toBeInTheDocument()
      fireEvent.click(screen.getByTitle('Close'))
    } finally {
      global.FileReader = originalFileReader
      global.Image = originalImage
    }
  })

  it('shows the context usage indicator from get_state', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompGetState.mockResolvedValue({ success: true, state: {
      thinkingLevel: 'off',
      contextUsage: { tokens: 1100, contextWindow: 200000, percent: 0.45 },
      autoCompactionEnabled: true,
    } })

    render(<Harness />)

    expect(await screen.findByText('45%')).toBeInTheDocument()
  })

  it('normalizes context percent reported as a raw percentage (not a fraction)', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    // Real omp runtimes report percent as 30.63 (already a percentage). It must
    // NOT be multiplied by 100 again (would show 3063%).
    mocks.ompGetState.mockResolvedValue({ success: true, state: {
      thinkingLevel: 'off',
      contextUsage: { tokens: 39200, contextWindow: 128000, percent: 30.63 },
    } })

    render(<Harness />)

    expect(await screen.findByText('31%')).toBeInTheDocument()
    expect(screen.queryByText('3063%')).not.toBeInTheDocument()
  })

  it('steers the running agent when a message is sent while busy', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's13',
      session: { id: 's13', title: 'Steer', sessionPath: 'C:/sessions/s13.jsonl' },
    })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'first task' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('first task')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())

    // While busy the input stays enabled and shows the steer hint
    expect(await screen.findByText(/steer it mid-task/)).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'no wait, do it differently' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(mocks.ompSteer).toHaveBeenCalledWith('p1', 'C:/demo', 'no wait, do it differently'))
    expect(screen.getByText('no wait, do it differently')).toBeInTheDocument()
    // Steering must not start a new chat turn
    expect(mocks.ompChat).toHaveBeenCalledTimes(1)
  })

  it('compacts the session context from the options menu', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })

    render(<Harness />)
    fireEvent.click(screen.getByTitle('Session options'))
    fireEvent.click(await screen.findByText('Compact context'))

    await waitFor(() => expect(mocks.ompCompact).toHaveBeenCalledWith('p1', 'C:/demo'))
    expect(await screen.findByText(/Context compacted/)).toBeInTheDocument()
  })

  it('toggles fast mode from the options menu', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })

    render(<Harness />)
    fireEvent.click(screen.getByTitle('Session options'))
    fireEvent.click(await screen.findByText('Fast mode'))

    await waitFor(() => expect(mocks.ompSetFastMode).toHaveBeenCalledWith('p1', 'C:/demo', true))
  })

  it('shows slash commands while typing / and inserts the selected one', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompGetCommands.mockResolvedValue({ success: true, commands: [
      { name: 'compact', description: 'Compact the conversation context' },
      { name: 'clear', description: 'Clear the conversation' },
    ] })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: '/com' } })

    expect(await screen.findByText('/compact')).toBeInTheDocument()
    expect(screen.queryByText('/clear')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('/compact'))
    await waitFor(() => expect(input.value).toBe('/compact '))
  })

  it('renders the todos panel from todo_reminder events', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })

    render(<Harness />)
    eventCb({ projectId: 'p1', event: { type: 'todo_reminder', phases: [
      { id: 'phase-1', name: 'Todos', tasks: [
        { id: 'task-1', content: 'Map the tool surface', status: 'in_progress' },
        { id: 'task-2', content: 'Exercise edit operations', status: 'pending' },
      ] },
    ] } })

    expect(await screen.findByText('Map the tool surface')).toBeInTheDocument()
    expect(screen.getByText('Exercise edit operations')).toBeInTheDocument()
  })

  it('exports the conversation via the native save dialog', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompExportConversation.mockResolvedValue({ success: true, canceled: false, path: 'C:/out/chat.md' })

    render(<Harness initialSession={{ id: 's14', title: 'Export me', sessionPath: 'C:/sessions/s14.jsonl' }} />)

    fireEvent.click(screen.getByTitle('Session options'))
    fireEvent.click(await screen.findByText('Export conversation'))

    await waitFor(() => {
      expect(mocks.ompExportConversation).toHaveBeenCalledWith('p1', 'C:/demo', 'C:/sessions/s14.jsonl', 'Export me')
    })
    expect(await screen.findByText((content) => content.includes('Exported to C:/out/chat.md'))).toBeInTheDocument()
  })

  it('applies custom instructions (handoff) from the options menu', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })

    render(<Harness />)
    fireEvent.click(screen.getByTitle('Session options'))
    fireEvent.click(await screen.findByText('Custom instructions…'))

    const textarea = screen.getByPlaceholderText(/Always explain changes/)
    fireEvent.change(textarea, { target: { value: 'Always explain before editing' } })
    fireEvent.click(screen.getByText('Apply'))

    await waitFor(() => {
      expect(mocks.ompHandoff).toHaveBeenCalledWith('p1', 'C:/demo', 'Always explain before editing')
    })
    expect(await screen.findByText(/Custom instructions applied/)).toBeInTheDocument()
  })

  it('keeps an unsent draft per session when switching away and back', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })

    const sessionA = { id: 'sa', title: 'A', sessionPath: 'C:/sessions/sa.jsonl' }
    const sessionB = { id: 'sb', title: 'B', sessionPath: 'C:/sessions/sb.jsonl' }
    const { rerender } = render(<Harness initialSession={sessionA} />)

    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'unsent draft for A' } })
    expect(input.value).toBe('unsent draft for A')

    // Switch to B — the input is empty (B has no draft)
    rerender(<Harness initialSession={sessionB} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Describe a task, ask a question…').value).toBe('')
    })

    // Switch back to A — the draft is restored
    rerender(<Harness initialSession={sessionA} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Describe a task, ask a question…').value).toBe('unsent draft for A')
    })
  })

  it('shows a live tokens-per-second badge while the agent is working', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's15',
      session: { id: 's15', title: 'TPS', sessionPath: 'C:/sessions/s15.jsonl' },
    })
    mocks.ompGetState.mockResolvedValue({ success: true, state: { thinkingLevel: 'off', tokensPerSecond: 12.3 } })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'go' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('go')

    // Busy triggers the fast state poll → the badge appears
    expect(await screen.findByText(/12 tok\/s/)).toBeInTheDocument()
  })

  it('renders subagent activity chips while the agent is working', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's16',
      session: { id: 's16', title: 'Sub', sessionPath: 'C:/sessions/s16.jsonl' },
    })
    mocks.ompGetSubagents.mockResolvedValue({ success: true, subagents: [
      { id: 'a1', task: 'Refactor the auth module', status: 'running', progress: 0.4 },
    ] })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'go' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('go')

    expect(await screen.findByText('Refactor the auth module')).toBeInTheDocument()
    expect(screen.getByText('Subagents')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('surfaces live status notices (notice / goal_updated) as inline messages', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })

    render(<Harness />)

    eventCb({ projectId: 'p1', event: { type: 'notice', message: 'Context is getting large' } })
    expect(await screen.findByText('Context is getting large')).toBeInTheDocument()

    eventCb({ projectId: 'p1', event: { type: 'goal_updated', goal: 'Ship the export feature' } })
    expect(await screen.findByText('Goal: Ship the export feature')).toBeInTheDocument()
  })

  it('runs a bash command in the project and shows the result in a terminal block', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompBash.mockResolvedValue({ success: true, data: { output: 'Build finished in 2s\nAll good', exitCode: 0 } })

    render(<Harness />)
    fireEvent.click(screen.getByTitle('Run command in project'))
    fireEvent.change(screen.getByPlaceholderText('Run command in project…'), { target: { value: 'npm run build' } })
    fireEvent.click(screen.getByText('Run'))

    await waitFor(() => expect(mocks.ompBash).toHaveBeenCalledWith('p1', 'C:/demo', 'npm run build'))
    expect(await screen.findByText('$ npm run build')).toBeInTheDocument()
    expect(await screen.findByText(/Build finished in 2s/)).toBeInTheDocument()
    expect(screen.getByText('exit 0')).toBeInTheDocument()
  })

  it('aborts a running bash command and marks the run cancelled', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    let resolveBash
    mocks.ompBash.mockImplementation(() => new Promise((resolve) => { resolveBash = resolve }))

    render(<Harness />)
    fireEvent.click(screen.getByTitle('Run command in project'))
    fireEvent.change(screen.getByPlaceholderText('Run command in project…'), { target: { value: 'sleep 100' } })
    fireEvent.click(screen.getByText('Run'))

    expect(await screen.findByText('$ sleep 100')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Stop'))
    await waitFor(() => expect(mocks.ompAbortBash).toHaveBeenCalledWith('p1', 'C:/demo'))

    // omp resolves the original bash command with cancelled: true after abort
    await act(async () => {
      resolveBash({ success: true, data: { output: '', exitCode: 130, cancelled: true } })
    })
    expect(await screen.findByText('cancelled')).toBeInTheDocument()
  })

  it('branches the conversation from a message that has an entryId', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [
      { id: 'e1', role: 'user', content: 'branch start' },
    ] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's17',
      session: { id: 's17', title: 'Branch', sessionPath: 'C:/sessions/s17.jsonl' },
    })
    mocks.ompBranch.mockResolvedValue({ success: true, data: { text: '', cancelled: false } })

    render(<Harness />)
    const input = screen.getByPlaceholderText('Describe a task, ask a question…')
    fireEvent.change(input, { target: { value: 'first task' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('first task')
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())

    eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
    eventCb({ projectId: 'p1', event: { type: 'agent_end', messages: [
      { id: 'entry-1', role: 'user', content: 'first task' },
      { id: 'entry-2', role: 'assistant', content: 'on it' },
    ] } })
    await screen.findByText('on it')

    // Both messages carry an entryId → Branch action is available on each.
    // Click the assistant one (second in the list).
    const branchButtons = screen.getAllByTitle('Branch the conversation from here')
    expect(branchButtons.length).toBe(2)
    fireEvent.click(branchButtons[1])
    await waitFor(() => expect(mocks.ompBranch).toHaveBeenCalledWith('p1', 'C:/demo', 'entry-2'))
    expect(await screen.findByText(/Branched/)).toBeInTheDocument()
    // The transcript is reloaded from the new branch
    expect(await screen.findByText('branch start')).toBeInTheDocument()
  })

  it('sends a system notification when the agent finishes while the app is unfocused', async () => {
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {} })
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] })
    mocks.ompChat.mockResolvedValue({
      success: true,
      sessionId: 's18',
      session: { id: 's18', title: 'Notify', sessionPath: 'C:/sessions/s18.jsonl' },
    })

    const originalVisibility = document.visibilityState
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    try {
      render(<Harness />)
      const input = screen.getByPlaceholderText('Describe a task, ask a question…')
      fireEvent.change(input, { target: { value: 'notify me' } })
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
      await screen.findByText('notify me')
      await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled())

      eventCb({ projectId: 'p1', event: { type: 'agent_start' } })
      eventCb({ projectId: 'p1', event: { type: 'agent_end', messages: [
        { role: 'user', content: 'notify me' },
        { role: 'assistant', content: 'all done here' },
      ] } })

      await waitFor(() => {
        expect(mocks.showNotification).toHaveBeenCalledWith(expect.objectContaining({
          title: expect.stringContaining('Agent finished'),
          body: expect.stringContaining('all done here'),
          silent: true,
        }))
      })
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: originalVisibility, configurable: true })
    }
  })

  it('shows an actionable error when loading an existing session fails, and retries', async () => {
    mocks.ompGetMessages.mockRejectedValueOnce(
      new Error("Error invoking remote method 'omp-get-messages': Error: omp command timed out: get_messages_page")
    )
    render(<Harness initialSession={{ id: 's20', title: 'Session 20', sessionPath: 'C:/sessions/s20.jsonl' }} />)

    // The skeleton is replaced by an error panel with the cleaned-up reason
    expect(await screen.findByText("Couldn't load this conversation")).toBeInTheDocument()
    expect(screen.getByText('omp command timed out: get_messages_page')).toBeInTheDocument()

    // Retry re-fetches; when it succeeds the transcript renders
    mocks.ompGetMessages.mockResolvedValueOnce({
      success: true,
      messages: [
        { id: 'entry-1', role: 'user', content: 'first task' },
        { id: 'entry-2', role: 'assistant', content: 'on it' },
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    expect(await screen.findByText('on it')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load this conversation")).not.toBeInTheDocument()
  })

  it('shows an error when the transcript request resolves unsuccessfully', async () => {
    mocks.ompGetMessages.mockResolvedValue({ success: false, error: 'omp RPC did not start' })
    render(<Harness initialSession={{ id: 's21', title: 'Session 21', sessionPath: 'C:/sessions/s21.jsonl' }} />)

    expect(await screen.findByText("Couldn't load this conversation")).toBeInTheDocument()
    expect(screen.getByText('omp RPC did not start')).toBeInTheDocument()
  })
})
