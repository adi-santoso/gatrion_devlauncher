import React, { useState } from 'react'
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
    } finally {
      global.FileReader = originalFileReader
      global.Image = originalImage
    }
  })
})
