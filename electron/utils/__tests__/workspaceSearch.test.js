// @ts-check
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { searchWorkspaceFiles } from '../workspaceSearch'

let tmp
let root

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-search-'))
  root = path.join(tmp, 'myapp')
  fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src', 'routes'), { recursive: true })
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true })
  fs.mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'router.js'), '')
  fs.writeFileSync(path.join(root, 'src', 'components', 'Button.jsx'), '')
  fs.writeFileSync(path.join(root, 'src', 'routes', 'admin.js'), '')
  fs.writeFileSync(path.join(root, 'package.json'), '{}')
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'router-dep.js'), '')
  fs.writeFileSync(path.join(root, 'dist', 'assets', 'router-bundle.js'), '')
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('searchWorkspaceFiles', () => {
  it('finds files whose name contains the query (case-insensitive)', async () => {
    const results = await searchWorkspaceFiles([root], 'ROUTER')
    const names = results.map((r) => r.name).sort()
    expect(names).toEqual(['router.js'])
    expect(results[0].project).toBe('myapp')
    expect(results[0].dir).toBe(path.join(root, 'src'))
  })

  it('skips ignored directories (node_modules, dist) and lockfiles', async () => {
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}')
    const results = await searchWorkspaceFiles([root], 'router')
    expect(results.map((r) => r.name)).toEqual(['router.js'])
  })

  it('returns nothing for queries shorter than 2 chars or too long', async () => {
    expect(await searchWorkspaceFiles([root], 'r')).toEqual([])
    expect(await searchWorkspaceFiles([root], 'a'.repeat(101))).toEqual([])
    expect(await searchWorkspaceFiles([root], '   ')).toEqual([])
  })

  it('respects the result limit', async () => {
    const results = await searchWorkspaceFiles([root], 'a', { limit: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('handles missing roots and duplicate roots gracefully', async () => {
    const results = await searchWorkspaceFiles([root, root, path.join(tmp, 'nope')], 'router')
    expect(results).toHaveLength(1)
  })

  it('does not descend deeper than the depth bound', async () => {
    const deep = path.join(root, 'src', 'a', 'b', 'c', 'd', 'e', 'f', 'g')
    fs.mkdirSync(deep, { recursive: true })
    fs.writeFileSync(path.join(deep, 'router-deep.js'), '')
    const results = await searchWorkspaceFiles([root], 'router')
    expect(results.map((r) => r.name)).toEqual(['router.js'])
  })

  it('searches across multiple roots and reports which project a hit belongs to', async () => {
    const second = path.join(tmp, 'second-app')
    fs.mkdirSync(path.join(second, 'lib'), { recursive: true })
    fs.writeFileSync(path.join(second, 'lib', 'router-helper.js'), '')
    const results = await searchWorkspaceFiles([root, second], 'router')
    const projects = results.map((r) => r.project).sort()
    expect(projects).toEqual(['myapp', 'second-app'])
  })
})
