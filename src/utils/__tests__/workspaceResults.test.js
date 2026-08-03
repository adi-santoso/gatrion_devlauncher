import { describe, expect, it } from 'vitest'
import { getWorkspaceControlMode, summarizeWorkspaceStart } from '../workspaceResults'

const projects = [{ id: 'one' }, { id: 'two' }]

describe('summarizeWorkspaceStart', () => {
  it('reports complete success using only targeted projects', () => {
    const summary = summarizeWorkspaceStart([
      { projectId: 'already-running', success: false },
      { projectId: 'one', success: true },
      { projectId: 'two', success: true },
    ], projects)
    expect(summary).toEqual({
      type: 'success', message: 'Workspace started: 2 project(s) running', started: 2, failed: 0,
    })
  })

  it('reports partial success', () => {
    const summary = summarizeWorkspaceStart([
      { projectId: 'one', success: true },
      { projectId: 'two', success: false },
    ], projects)
    expect(summary.type).toBe('warning')
    expect(summary.message).toContain('1 started, 1 failed')
  })

  it('reports complete failure', () => {
    const summary = summarizeWorkspaceStart([
      { projectId: 'one', success: false },
      { projectId: 'two', success: false },
    ], projects)
    expect(summary.type).toBe('error')
    expect(summary.message).toContain('2 project(s) failed')
  })

  it('rejects malformed response envelopes', () => {
    expect(summarizeWorkspaceStart({ success: true }, projects).type).toBe('error')
  })
})

describe('getWorkspaceControlMode', () => {
  it('shows start only when all projects are stopped', () => {
    expect(getWorkspaceControlMode([{ status: 'stopped' }, { status: 'error' }])).toBe('stopped')
  })

  it('shows start remaining and stop all for a partial workspace', () => {
    expect(getWorkspaceControlMode([{ status: 'running' }, { status: 'stopped' }])).toBe('partial')
  })

  it('hides start when every project is running or starting', () => {
    expect(getWorkspaceControlMode([{ status: 'running' }, { status: 'starting' }])).toBe('all-active')
  })

  it('keeps the explicit action state while startup is pending', () => {
    expect(getWorkspaceControlMode([{ status: 'stopped' }], 'starting')).toBe('starting')
  })
})
