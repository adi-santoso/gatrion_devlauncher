import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

import { topologicalSort } from '../../handlers/processHandlers'

const project = (id, dependsOn = []) => ({ id, name: id, dependsOn })

describe('topologicalSort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns projects in dependency order (dependencies first)', () => {
    const projects = [
      project('app', ['db', 'api']),
      project('api', ['db']),
      project('db'),
    ]
    const sorted = topologicalSort(projects).map((p) => p.id)
    const dbIndex = sorted.indexOf('db')
    const apiIndex = sorted.indexOf('api')
    const appIndex = sorted.indexOf('app')
    expect(dbIndex).toBeLessThan(apiIndex)
    expect(apiIndex).toBeLessThan(appIndex)
    expect(new Set(sorted)).toEqual(new Set(['app', 'api', 'db']))
  })

  test('handles missing dependency ids gracefully', () => {
    const projects = [project('app', ['ghost']), project('db')]
    const sorted = topologicalSort(projects).map((p) => p.id)
    expect(sorted).toHaveLength(2)
  })

  test('breaks dependency cycles without infinite loop', () => {
    const projects = [project('a', ['b']), project('b', ['a'])]
    const sorted = topologicalSort(projects).map((p) => p.id)
    expect(sorted).toHaveLength(2)
  })

  test('preserves input order for independent projects', () => {
    const projects = [project('x'), project('y'), project('z')]
    expect(topologicalSort(projects).map((p) => p.id)).toEqual(['x', 'y', 'z'])
  })

  test('empty and single project lists', () => {
    expect(topologicalSort([])).toEqual([])
    expect(topologicalSort([project('only')]).map((p) => p.id)).toEqual(['only'])
  })
})
