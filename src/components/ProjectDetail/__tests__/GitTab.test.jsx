import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GitTab from '../GitTab'

const mocks = vi.hoisted(() => ({
  gitStatus: vi.fn(),
  gitLog: vi.fn(),
  gitDiff: vi.fn(),
  gitStage: vi.fn(),
  gitUnstage: vi.fn(),
  gitCommit: vi.fn(),
  gitPull: vi.fn(),
  gitPush: vi.fn(),
  gitCheckout: vi.fn(),
  gitInit: vi.fn(),
  gitStashList: vi.fn(),
  gitStashPush: vi.fn(),
  gitStashPop: vi.fn(),
  gitStashApply: vi.fn(),
  gitStashDrop: vi.fn(),
  gitDiscard: vi.fn(),
  gitBlame: vi.fn(),
}))

vi.mock('../../../utils/ipcRenderer', () => mocks)

const project = { id: 'p1', name: 'Demo', path: 'C:/demo' }

const STATUS = {
  success: true,
  isRepo: true,
  branch: 'main',
  upstream: 'origin/main',
  ahead: 2,
  behind: 1,
  staged: [{ path: 'src/new-file.js', staged: 'added', unstaged: ' ' }],
  unstaged: [{ path: 'src/App.jsx', staged: ' ', unstaged: 'modified' }],
  untracked: ['todo.md'],
}

describe('GitTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.gitStatus.mockResolvedValue(STATUS)
    mocks.gitLog.mockResolvedValue({
      success: true,
      commits: [{ hash: 'a1b2c3d', author: 'Alice', date: '2026-08-01', subject: 'Add git tab' }],
    })
    mocks.gitDiff.mockResolvedValue({ success: true, diff: 'diff --git a/src/App.jsx b/src/App.jsx\n-old\n+new\n' })
    mocks.gitStage.mockResolvedValue({ success: true })
    mocks.gitUnstage.mockResolvedValue({ success: true })
    mocks.gitCommit.mockResolvedValue({ success: true })
    mocks.gitPull.mockResolvedValue({ success: true })
    mocks.gitPush.mockResolvedValue({ success: true })
    mocks.gitCheckout.mockResolvedValue({ success: true })
    mocks.gitInit.mockResolvedValue({ success: true })
    mocks.gitStashList.mockResolvedValue({ success: true, stashes: [{ index: 0, ref: 'stash@{0}', message: 'WIP auth work' }] })
    mocks.gitStashPush.mockResolvedValue({ success: true })
    mocks.gitStashPop.mockResolvedValue({ success: true })
    mocks.gitStashApply.mockResolvedValue({ success: true })
    mocks.gitStashDrop.mockResolvedValue({ success: true })
    mocks.gitDiscard.mockResolvedValue({ success: true })
    mocks.gitBlame.mockResolvedValue({ success: true, lines: [] })
  })

  it('renders branch, ahead/behind, file lists and commits', async () => {
    render(<GitTab project={project} />)
    expect(await screen.findByText('main')).toBeInTheDocument()
    expect(screen.getByText(/tracks origin\/main/)).toBeInTheDocument()
    expect(screen.getByText('↑2')).toBeInTheDocument()
    expect(screen.getByText('↓1')).toBeInTheDocument()
    expect(screen.getByText('src/new-file.js')).toBeInTheDocument()
    expect(screen.getByText('src/App.jsx')).toBeInTheDocument()
    expect(screen.getByText('todo.md')).toBeInTheDocument()
    expect(screen.getByText('Add git tab')).toBeInTheDocument()
    expect(screen.getByText('WIP auth work')).toBeInTheDocument()
  })

  it('stages an unstaged file when its checkbox is toggled', async () => {
    render(<GitTab project={project} />)
    const checkbox = await screen.findByLabelText('Stage src/App.jsx')
    fireEvent.click(checkbox)
    await waitFor(() => expect(mocks.gitStage).toHaveBeenCalledWith('C:/demo', ['src/App.jsx']))
  })

  it('unstages a staged file when its checkbox is toggled', async () => {
    render(<GitTab project={project} />)
    const checkbox = await screen.findByLabelText('Unstage src/new-file.js')
    fireEvent.click(checkbox)
    await waitFor(() => expect(mocks.gitUnstage).toHaveBeenCalledWith('C:/demo', ['src/new-file.js']))
  })

  it('commits with a message when there are staged files', async () => {
    render(<GitTab project={project} />)
    const input = await screen.findByPlaceholderText('Commit message (Ctrl+Enter)')
    fireEvent.change(input, { target: { value: 'feat: stage and commit' } })
    fireEvent.click(screen.getByRole('button', { name: /Commit/ }))
    await waitFor(() => expect(mocks.gitCommit).toHaveBeenCalledWith('C:/demo', 'feat: stage and commit'))
    expect(await screen.findByText(/Committed: feat: stage and commit/)).toBeInTheDocument()
  })

  it('requires confirmation before pushing', async () => {
    render(<GitTab project={project} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Push$/ }))
    expect(screen.getByText('Push to Remote')).toBeInTheDocument()
    // The confirm button lives in the dialog; the branch bar also has a "Push" button
    const pushButtons = screen.getAllByRole('button', { name: /^Push$/ })
    fireEvent.click(pushButtons[pushButtons.length - 1])
    await waitFor(() => expect(mocks.gitPush).toHaveBeenCalledWith('C:/demo'))
  })

  it('shows the init flow for folders that are not repositories', async () => {
    mocks.gitStatus.mockResolvedValue({ success: true, isRepo: false, branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] })
    render(<GitTab project={project} />)
    expect(await screen.findByText('Not a Git Repository')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Initialize Repository/ }))
    expect(screen.getByText('Initialize Git Repository')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Initialize', exact: true }))
    await waitFor(() => expect(mocks.gitInit).toHaveBeenCalledWith('C:/demo'))
  })
})
