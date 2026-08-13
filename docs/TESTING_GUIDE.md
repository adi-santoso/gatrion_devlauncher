# Testing Guide - DevLauncher

## Overview

DevLauncher uses **Vitest** for unit testing React components and hooks, plus Node.js native test runners for backend logic.

## Test Structure

```
├── src/**/__tests__/            # React component/hook/utils tests (Vitest)
├── electron/**/__tests__/       # Backend manager & handler tests (Vitest)
├── tests/cli/                   # Legacy CLI tests (Node only, via npm test)
│   ├── test-process-manager.js
│   ├── test-schema.js
│   └── ...
├── tests/setup.js               # Vitest setup file (globals + mock resets)
├── e2e/                         # Playwright smoke tests
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

### Backend Tests (CLI)
```bash
npm test              # Run all 13 legacy CLI tests (tests/cli/)
node tests/cli/test-process-manager.js
node tests/cli/test-schema.js
node tests/cli/test-storage-manager.js
node tests/cli/test-security-hardening.js
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

### Manager Tests (Node.js)

Use Node's native `require` for backend managers:

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

| Module | Target Coverage | Current |
|--------|----------------|---------|
| ProcessManager | 80% | ~60% |
| StorageManager | 90% | ~70% |
| ProjectDetector | 85% | ~50% |
| useProjects hook | 80% | ~40% |
| useProcesses hook | 80% | ~30% |

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

Tests should pass in CI environment before merge:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm run test:unit
```
