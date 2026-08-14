# Testing Guide - DevLauncher

## Overview

DevLauncher uses **Vitest** for all unit and integration tests (renderer components/hooks and Electron main-process managers/handlers), plus **Playwright** for end-to-end tests that launch the real app. There is a single test tool — no separate legacy runners.

## Test Structure

```
├── src/**/__tests__/            # React component/hook/utils tests (Vitest)
├── electron/**/__tests__/       # Backend manager & handler tests (Vitest)
├── scripts/__tests__/           # Utility script tests, e.g. changelogLib (Vitest)
├── tests/setup.js               # Vitest setup file (globals + mock resets)
├── tests/mocks/                 # Shared Electron mock (patched via Module._load)
├── tests/fixtures/              # Mock omp RPC (JSON-lines) dipakai unit test OmpManager + e2e agent
├── e2e/                         # Playwright tests (smoke + flow: project lifecycle, settings, agent chat)
├── vitest.config.js             # Vitest configuration
└── playwright.config.js         # Playwright configuration
```

## Running Tests

### Unit Tests (React + Hooks)
```bash
npm run test:unit      # Run all unit tests once
npm run test:watch     # Watch mode for development
npm run test:coverage  # Generate coverage report
```

### Full Suite + E2E
```bash
npm test              # Everything: vitest run (renderer + electron, ~500 tests)
npm run test:e2e      # Playwright: launches the real Electron app (smoke + flows)
```

### ESLint
```bash
npm run lint          # Check code quality
```

## Writing New Tests

### React Hook Tests

Use React Testing Library with Vitest mocking:

```javascript
import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock external dependencies
vi.mock('../../utils/ipcRenderer', () => ({
  isElectronAvailable: () => false,
  ipc: {
    invoke: vi.fn(),
    on: vi.fn(() => () => {})
  }
}))

describe('useProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('initializes with empty projects array', () => {
    const { result } = renderHook(() => useProjects())
    expect(result.current.projects).toEqual([])
  })
})
```

### Manager Tests (Electron main process)

Managers and IPC handlers are plain CJS modules, so tests `require` them directly with Vitest (a shared mock for `electron` is installed automatically via `tests/setup.js`):

```javascript
const { describe, test, expect, beforeEach } = require('vitest')
const fs = require('fs').promises
const path = require('path')
const StorageManager = require('../StorageManager')

describe('StorageManager', () => {
  let tempDir
  let manager

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'test-'))
    manager = new StorageManager(tempDir)
    await manager.init()
  })

  test('saves and loads projects correctly', async () => {
    const testProjects = [{ id: '1', name: 'Test', path: '/test' }]
    await manager.saveProjects(testProjects)
    const loaded = await manager.loadProjects()
    expect(loaded).toHaveLength(1)
  })
})
```

## Test Coverage Goals

| Module | Current (approx.) |
|--------|-------------------|
| IPC handlers (8 file) | ~86% |
| ipcValidation | ~99% |
| preload | ~91% |
| HealthManager / OmpConfig | ~98% |
| OmpManager | ~83% |
| Overall lines | ~58% (naik tiap batch) |

## Mock Data Pattern

Always mock IPC calls to renderer utilities:

```javascript
vi.mocked(window.electron?.ipcRenderer?.invoke)
  .mockImplementation((channel, ...args) => {
    if (channel === 'project:list') return mockProjects
    if (channel === 'project:add') return mockNewProject
    return null
  })
```

## Best Practices

1. **Clean state**: Use `beforeEach` to reset mocks and states
2. **Isolation**: Each test should be independent
3. **Async handling**: Always `await` promises and use `act()` for React updates
4. **Realistic data**: Use realistic project/process objects, not bare stubs
5. **Edge cases**: Test error paths, not just happy paths

## CI Integration

GitHub Actions runs on a 3-OS matrix (windows/macos/ubuntu): lint, `npm test` (Vitest), `vite build`, and Playwright e2e (Linux via `xvfb-run`). A shared Electron mock is installed in `tests/setup.js` by patching `Module._load`, because `vi.mock` does not reach CJS `require()` calls inside Electron modules.
