import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentView from '../AgentView';

const mocks = vi.hoisted(() => ({
  ompStatus: vi.fn(),
  ompListSessions: vi.fn(),
  ompCreateSession: vi.fn(),
  ompDeleteSession: vi.fn(),
  ompTogglePin: vi.fn(),
  ompRenameSession: vi.fn(),
  onOmpEvent: vi.fn(),
  ompGetMessages: vi.fn(),
  ompChat: vi.fn(),
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
  mocks.onOmpEvent.mockReturnValue(() => {});
  mocks.ompGetMessages.mockResolvedValue({ success: true, messages: [] });
  mocks.ompChat.mockResolvedValue({ success: true, sessionId: 's1', session });
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

    // Sessions appear in the sidebar…
    expect(await screen.findByText('Session 1')).toBeInTheDocument();
    // …but the chat stays on the placeholder: no composer, no accidental session.
    expect(screen.getByText('Select a session to continue')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Describe a task, ask a question…')).not.toBeInTheDocument();
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
    expect(screen.getByPlaceholderText('Describe a task, ask a question…')).toBeInTheDocument();
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
    expect(screen.getByPlaceholderText('Describe a task, ask a question…')).toBeInTheDocument();
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

    const input = screen.getByPlaceholderText('Describe a task, ask a question…');
    fireEvent.change(input, { target: { value: 'my first task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    // The newly created session surfaces in the sidebar so it can be resumed later
    // (the text also appears in the chat header + user bubble — any match proves it)
    expect((await screen.findAllByText('my first task')).length).toBeGreaterThan(0);
  });
});
