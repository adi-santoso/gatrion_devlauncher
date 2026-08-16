import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  requestApproval,
  respondApproval,
  denyAllApprovals,
  pendingApprovalCount,
  setApprovalSender,
  APPROVAL_TIMEOUT_MS,
} from '../approval'

const tool = {
  name: 'devlauncher_delete_project',
  label: 'Hapus project',
  description: 'Remove a project from the workspace',
  permission: 'destructive',
  handler: async () => ({ success: true }),
}

const deps = {
  storageManager: { loadProjects: async () => [{ id: 'p1', name: 'Demo' }] },
}

describe('MCP approval flow', () => {
  let captured

  beforeEach(() => {
    captured = null
    setApprovalSender((request) => {
      captured = request
      return true
    })
  })

  afterEach(() => {
    denyAllApprovals()
    setApprovalSender(null)
    vi.useRealTimers()
  })

  test('request reaches the renderer with project name and masked args', async () => {
    const promise = requestApproval(tool, deps, { projectId: 'p1', password: 'hunter2' })
    await vi.waitFor(() => expect(captured).not.toBeNull())
    expect(captured.id).toMatch(/^[0-9a-f]{16}$/)
    expect(captured.tool).toBe('devlauncher_delete_project')
    expect(captured.label).toBe('Hapus project')
    expect(captured.projectName).toBe('Demo')
    expect(captured.projectId).toBe('p1')
    expect(captured.args.password).toBe('***')
    respondApproval(captured.id, 'approved')
    await expect(promise).resolves.toEqual({ approved: true, reason: 'approved' })
    expect(pendingApprovalCount()).toBe(0)
  })

  test('deny resolves the call with a clear refusal', async () => {
    const promise = requestApproval(tool, deps, {})
    await vi.waitFor(() => expect(captured).not.toBeNull())
    respondApproval(captured.id, 'denied')
    const result = await promise
    expect(result.approved).toBe(false)
    expect(result.reason).toMatch(/menolak/i)
  })

  test('entries values are masked in the request payload', async () => {
    const promise = requestApproval(tool, deps, { projectId: 'p1', entries: [{ key: 'API_KEY', value: 's3cr3t' }] })
    await vi.waitFor(() => expect(captured).not.toBeNull())
    expect(captured.args.entries[0]).toEqual({ key: 'API_KEY', value: '***' })
    expect(JSON.stringify(captured.args)).not.toMatch(/s3cr3t/)
    respondApproval(captured.id, 'denied')
    await promise
  })

  test('unknown / expired approval id returns false', () => {
    expect(respondApproval('nope', 'approved')).toBe(false)
  })

  test('timeout auto-denies a request the user never answered', async () => {
    vi.useFakeTimers()
    const promise = requestApproval(tool, deps, {})
    await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS + 1)
    const result = await promise
    expect(result.approved).toBe(false)
    expect(result.reason).toMatch(/timed out/i)
    expect(pendingApprovalCount()).toBe(0)
  })

  test('no sender wired → immediate denial (never hangs)', async () => {
    setApprovalSender(null)
    const result = await requestApproval(tool, deps, {})
    expect(result.approved).toBe(false)
    expect(result.reason).toMatch(/channel is not available/)
  })

  test('sender that cannot deliver (no window) → immediate denial', async () => {
    setApprovalSender(() => false)
    const result = await requestApproval(tool, deps, {})
    expect(result.approved).toBe(false)
    expect(result.reason).toMatch(/window is not available/)
  })

  test('denyAllApprovals resolves every pending request as denied', async () => {
    const first = requestApproval(tool, deps, {})
    const second = requestApproval(tool, deps, {})
    await vi.waitFor(() => expect(pendingApprovalCount()).toBe(2))
    denyAllApprovals()
    const [a, b] = await Promise.all([first, second])
    expect(a.approved).toBe(false)
    expect(b.approved).toBe(false)
    expect(pendingApprovalCount()).toBe(0)
  })

  test('duplicate responses to the same id are ignored', async () => {
    const promise = requestApproval(tool, deps, {})
    await vi.waitFor(() => expect(captured).not.toBeNull())
    expect(respondApproval(captured.id, 'approved')).toBe(true)
    expect(respondApproval(captured.id, 'denied')).toBe(false)
    await expect(promise).resolves.toEqual({ approved: true, reason: 'approved' })
  })
})
