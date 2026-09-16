import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentView from '../AgentView';

beforeAll(() => {
  // jsdom does not implement scrollIntoView
  window.Element.prototype.scrollIntoView = vi.fn();
});

const mocks = vi.hoisted(() => ({
  ompStatus: vi.fn(),
  ompListSessions: vi.fn(),
  ompCreateSession: vi.fn(),
  ompDeleteSession: vi.fn(),
  ompTogglePin: vi.fn(),
  ompRenameSession: vi.fn(),
  ompUpdateSessionTokens: vi.fn(),
  onOmpEvent: vi.fn(),
  ompGetMessages: vi.fn(),
  ompChat: vi.fn(),
  ompAbort: vi.fn(),
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
}));

vi.mock('../../../utils/ipcRenderer', () => mocks);

const project = { id: 'p1', name: 'Demo', path: 'C:/demo' };
const session = { id: 's1', title: 'Session 1', lastActive: Date.now(), tokens: 0, pinned: false, sessionPath: 'C:/sessions/s1.jsonl' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ompStatus.mockResolvedValue({ success: true, installed: true, configured: true, version: '17.2.15' });
  mocks.ompListSessions.mockResolvedValue({ success: true, sessions: [session] });
  mocks.ompCreateSession.mockResolvedValue({ success: true, session: { ...session, id: 's2', title: 'Session 2' } });
  mocks.ompDeleteSession.mockResolvedValue({ success: true });
  mocks.ompTogglePin.mockResolvedValue({ success: true });
  mocks.ompRenameSession.mockResolvedValue({ success: true });
  mocks.ompUpdateSessionTokens.mockResolvedValue({ success: true });
  mocks.onOmpEvent.mockReturnValue(() => {});
  mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] });
  mocks.ompChat.mockResolvedValue({ success: true, sessionId: 's1', session });
  mocks.ompAbort.mockResolvedValue({ success: true });
  mocks.ompConfigGet.mockResolvedValue({ success: true, providers: [], defaultModel: null });
  mocks.ompConfigSetDefault.mockResolvedValue({ success: true });
  mocks.ompSetModel.mockResolvedValue({ success: true });
  mocks.ompGetModels.mockResolvedValue({ success: true, models: [] });
  mocks.ompSetThinkingLevel.mockResolvedValue({ success: true });
  mocks.ompGetState.mockResolvedValue({ success: true, state: { thinkingLevel: 'off' } });
  mocks.ompSteer.mockResolvedValue({ success: true });
  mocks.ompGetCommands.mockResolvedValue({ success: true, commands: [] });
  mocks.ompCompact.mockResolvedValue({ success: true });
  mocks.ompSetAutoCompaction.mockResolvedValue({ success: true });
  mocks.ompSetAutoRetry.mockResolvedValue({ success: true });
  mocks.ompSetFastMode.mockResolvedValue({ success: true });
  mocks.ompExportConversation.mockResolvedValue({ success: true, canceled: true });
  mocks.ompHandoff.mockResolvedValue({ success: true });
  mocks.ompSetSubagentSubscription.mockResolvedValue({ success: true });
  mocks.ompGetSubagents.mockResolvedValue({ success: true, subagents: [] });
  mocks.ompBash.mockResolvedValue({ success: true, data: { output: 'done', exitCode: 0 } });
  mocks.ompAbortBash.mockResolvedValue({ success: true });
  mocks.ompBranch.mockResolvedValue({ success: true, data: { text: '', cancelled: false } });
  mocks.getConfig.mockResolvedValue({ success: true, config: { agent: { notifyOnFinish: true }, notifications: { sound: false } } });
  mocks.updateConfig.mockResolvedValue({ success: true, config: {} });
  mocks.showNotification.mockResolvedValue({ success: true });
});

describe('AgentView', () => {
  it('clicking a project row only expands its session list — it does not open the chat', async () => {
    render(<AgentView projects={[project]} />);
    expect(screen.getByText('Select a project to start chatting')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Demo'));

    // Sessions appear in the sidebar...
    expect(await screen.findByText('Session 1')).toBeInTheDocument();
    // ...but the chat stays on the placeholder: no composer, no accidental session.
    expect(screen.getByText('Select a session to continue')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Describe a task, ask a question...')).not.toBeInTheDocument();
    expect(mocks.ompGetMessages).not.toHaveBeenCalled();
  });

  it('clicking the project row again collapses the list back to the initial placeholder', async () => {
    render(<AgentView projects={[project]} />);
    fireEvent.click(screen.getByText('Demo'));
    expect(await screen.findByText('Session 1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Demo'));

    expect(screen.queryByText('Session 1')).not.toBeInTheDocument();
    expect(screen.getByText('Select a project to start chatting')).toBeInTheDocument();
  });

  it('clicking a session row opens the chat for that session', async () => {
    render(<AgentView projects={[project]} />);
    fireEvent.click(screen.getByText('Demo'));
    fireEvent.click(await screen.findByText('Session 1'));

    // Composer is now visible and history was requested for that session
    expect(await screen.findByPlaceholderText('Describe a task, ask a question...')).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(mocks.ompGetMessages).toHaveBeenCalledWith('p1', 'C:/demo', { sessionPath: 'C:/sessions/s1.jsonl' });
    });
  });

  it('New session creates a session that appears in the list and opens the chat', async () => {
    render(<AgentView projects={[project]} />);
    fireEvent.click(screen.getByText('Demo'));
    fireEvent.click(await screen.findByRole('button', { name: /New session/ }));

    // Appears in the sidebar list (and the chat header once opened)
    expect((await screen.findAllByText('Session 2')).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Describe a task, ask a question...')).toBeInTheDocument();
  });

  it('sending the first message keeps the implicitly-created session visible in the list', async () => {
    mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] });
    mocks.ompChat.mockResolvedValueOnce({
      success: true,
      sessionId: 's-new',
      session: { id: 's-new', title: 'my first task', sessionPath: null },
    });
    render(<AgentView projects={[project]} />);
    fireEvent.click(screen.getByText('Demo'));
    fireEvent.click(await screen.findByText('Session 1'));

    const input = await screen.findByPlaceholderText('Describe a task, ask a question...');
    fireEvent.change(input, { target: { value: 'my first task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    // The newly created session surfaces in the sidebar so it can be resumed later
    // (the text also appears in the chat header + user bubble — any match proves it)
    expect((await screen.findAllByText('my first task')).length).toBeGreaterThan(0);
  });

  it('persists token usage to the registry when a turn finishes', async () => {
    let eventCb = null;
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {}; });
    render(<AgentView projects={[project]} />);
    fireEvent.click(screen.getByText('Demo'));
    fireEvent.click(await screen.findByText('Session 1'));
    await vi.waitFor(() => expect(eventCb).toBeTruthy());

    const input = await screen.findByPlaceholderText('Describe a task, ask a question...');
    fireEvent.change(input, { target: { value: 'count tokens' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    eventCb({ projectId: 'p1', event: { type: 'agent_start' } });
    eventCb({ projectId: 'p1', event: {
      type: 'agent_end',
      messages: [
        { role: 'user', content: 'count tokens' },
        { role: 'assistant', content: 'done', usage: { totalTokens: 2345 } },
      ],
    } });

    // Usage + estimated cost are persisted so the badge survives restarts
    await vi.waitFor(() => {
      expect(mocks.ompUpdateSessionTokens).toHaveBeenCalledWith('p1', 's1', 2345, expect.any(Number));
    });
  });

  it('does not clobber a persisted token count when a turn reports no usage', async () => {
    let eventCb = null;
    mocks.onOmpEvent.mockImplementation((callback) => { eventCb = callback; return () => {}; });
    // The session already has a persisted count
    mocks.ompListSessions.mockResolvedValue({ success: true, sessions: [{ ...session, tokens: 5000 }] });
    render(<AgentView projects={[project]} />);
    fireEvent.click(screen.getByText('Demo'));
    fireEvent.click(await screen.findByText('Session 1'));
    await vi.waitFor(() => expect(eventCb).toBeTruthy());

    // agent_end without a usage payload reports 0 — must NOT be persisted
    eventCb({ projectId: 'p1', event: { type: 'agent_end', messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }] } });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.ompUpdateSessionTokens).not.toHaveBeenCalled();
  });

  it('navigating with initialSessionId opens that session once its list loads', async () => {
    render(<AgentView projects={[project]} initialProjectId="p1" initialSessionId="s1" />);

    // The project list auto-expands and the session auto-selects — no clicks.
    const composer = await screen.findByPlaceholderText('Describe a task, ask a question...');
    expect(composer).toBeInTheDocument();
    await vi.waitFor(() => expect(mocks.ompGetMessages).toHaveBeenCalled());
  });

  it('searches sessions in unopened projects and opens the matching project', async () => {
    const other = { id: 'p2', name: 'Other', path: 'C:/other' };
    mocks.ompListSessions.mockImplementation(async (id) => ({ success: true, sessions: id === 'p1' ? [session] : [{ ...session, id: 's-other', title: 'Fix checkout', sessionPath: 'C:/sessions/other.jsonl' }] }));
    render(<AgentView projects={[project, other]} />);
    expect(await screen.findByText('2 sessions')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search projects and sessions'), { target: { value: 'checkout' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Fix checkout' }));
    await waitFor(() => expect(mocks.ompGetMessages).toHaveBeenCalledWith('p2', 'C:/other', { sessionPath: 'C:/sessions/other.jsonl' }));
    fireEvent.change(screen.getByLabelText('Search projects and sessions'), { target: { value: 'no-such-session' } });
    expect(screen.getByText(/No projects or sessions match/)).toBeInTheDocument();
  });

  it('shows a failed list request and retries it without caching the failure as an empty list', async () => {
    mocks.ompListSessions.mockRejectedValueOnce(new Error('Registry unavailable'));
    render(<AgentView projects={[project]} initialProjectId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Registry unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading sessions' }));
    expect(await screen.findByRole('button', { name: 'Session 1' })).toBeInTheDocument();
    expect(mocks.ompListSessions).toHaveBeenCalledTimes(2);
  });

  it('keeps a session visible when deletion fails', async () => {
    mocks.ompDeleteSession.mockResolvedValueOnce({ success: false, error: 'Could not remove history' });
    render(<AgentView projects={[project]} initialProjectId="p1" initialSessionId="s1" />);
    await screen.findByPlaceholderText('Describe a task, ask a question...');
    fireEvent.click(screen.getByRole('button', { name: 'Delete session' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not remove history');
    expect(screen.getByRole('button', { name: 'Session 1' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByLabelText('Message to agent')).toBeInTheDocument();
  });

  it('prevents duplicate creation and exposes a rejected create request', async () => {
    let rejectCreate;
    mocks.ompCreateSession.mockImplementationOnce(() => new Promise((_, reject) => { rejectCreate = reject; }));
    render(<AgentView projects={[project]} initialProjectId="p1" />);
    await screen.findByRole('button', { name: 'Session 1' });
    fireEvent.click(screen.getByRole('button', { name: 'New session' }));
    expect(screen.getByRole('button', { name: 'Creating session...' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'New', exact: true }));
    expect(mocks.ompCreateSession).toHaveBeenCalledTimes(1);
    await act(async () => rejectCreate(new Error('Disk full')));
    expect(screen.getByRole('alert')).toHaveTextContent('Disk full');
    expect(screen.getByRole('button', { name: 'New session' })).toBeEnabled();
  });

  it('does not pair a late-created session with a different selected project', async () => {
    let resolveCreate;
    mocks.ompCreateSession.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const other = { id: 'p2', name: 'Other', path: 'C:/other' };
    render(<AgentView projects={[project, other]} initialProjectId="p1" />);
    await screen.findByRole('button', { name: 'Session 1' });
    fireEvent.click(screen.getByRole('button', { name: 'New session' }));
    fireEvent.click(screen.getByText('Other'));
    await act(async () => resolveCreate({ success: true, session: { ...session, id: 's-late', title: 'Late session' } }));
    expect(screen.queryByLabelText('Message to agent')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Demo'));
    expect(screen.getByRole('button', { name: 'Late session' })).toBeInTheDocument();
  });

  it('keyboard actions do not open sessions, Escape cancels rename, and Enter commits once', async () => {
    const user = userEvent.setup();
    render(<AgentView projects={[project]} initialProjectId="p1" />);
    await screen.findByRole('button', { name: 'Session 1' });
    screen.getByRole('button', { name: 'Rename session' }).focus();
    await user.keyboard('{Enter}');
    await user.clear(screen.getByLabelText('Session title'));
    await user.type(screen.getByLabelText('Session title'), 'Cancelled title{Escape}');
    expect(mocks.ompRenameSession).not.toHaveBeenCalled();
    expect(mocks.ompGetMessages).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Session 1' }));
    await screen.findByPlaceholderText('Describe a task, ask a question...');
    await user.click(screen.getByRole('button', { name: 'Rename session' }));
    await user.clear(screen.getByLabelText('Session title'));
    await user.type(screen.getByLabelText('Session title'), 'Updated title{Enter}');
    await waitFor(() => expect(mocks.ompRenameSession).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText('Updated title')).toHaveLength(2);
  });

  it('keeps drafts after collapsing and reopening a project', async () => {
    render(<AgentView projects={[project]} initialProjectId="p1" initialSessionId="s1" />);
    const input = await screen.findByPlaceholderText('Describe a task, ask a question...');
    fireEvent.change(input, { target: { value: 'Do not lose this draft' } });
    const sidebar = within(screen.getByRole('complementary', { name: 'Agent sessions' }));
    fireEvent.click(sidebar.getByText('Demo'));
    fireEvent.click(sidebar.getByText('Demo'));
    fireEvent.click(sidebar.getByRole('button', { name: 'Session 1' }));
    expect(await screen.findByPlaceholderText('Describe a task, ask a question...')).toHaveValue('Do not lose this draft');
  });

  it('does not replace a user-chosen session title with the runtime-generated title', async () => {
    mocks.ompListSessions.mockResolvedValue({ success: true, sessions: [{ ...session, title: 'My release checklist' }] });
    mocks.ompGetState.mockResolvedValue({ success: true, state: { sessionName: 'Generated title' } });
    render(<AgentView projects={[project]} initialProjectId="p1" initialSessionId="s1" />);
    await screen.findByPlaceholderText('Describe a task, ask a question...');
    await waitFor(() => expect(mocks.ompGetState).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'My release checklist' })).toHaveAttribute('aria-current', 'true');
    expect(mocks.ompRenameSession).not.toHaveBeenCalled();
  });

  it('refreshes provider status after returning from Settings', async () => {
    mocks.ompStatus.mockResolvedValueOnce({ success: true, installed: true, configured: false });
    const { rerender } = render(<AgentView projects={[project]} />);
    expect(await screen.findByRole('button', { name: 'Set up provider' })).toBeInTheDocument();
    rerender(<AgentView projects={[project]} visible={false} />);
    rerender(<AgentView projects={[project]} visible />);
    expect(await screen.findByText('provider ready')).toBeInTheDocument();
    expect(mocks.ompStatus).toHaveBeenCalledTimes(2);
  });

  it('keeps the running session selected until Stop, then allows switching', async () => {
    mocks.ompListSessions.mockResolvedValue({ success: true, sessions: [session, { ...session, id: 's2', title: 'Second' }] });
    render(<AgentView projects={[project]} initialProjectId="p1" initialSessionId="s1" />);
    const input = await screen.findByPlaceholderText('Describe a task, ask a question...');
    fireEvent.change(input, { target: { value: 'Work on this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByRole('button', { name: 'Second' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New session' })).toBeDisabled();
    await waitFor(() => expect(mocks.ompChat).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Stop', exact: true }));
    expect(screen.getByRole('button', { name: 'Second' })).toBeEnabled();
  });
});
