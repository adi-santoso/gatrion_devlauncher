// Regression guard for the "centralized schema validation" P1 item: registering
// every handler must produce ONLY channels that have a shape rule in
// CHANNEL_RULES — otherwise a new handler channel silently bypasses the
// central validation layer.
//
// The electron mock is installed by tests/setup.js (Module._load patch), so
// `require('electron')` inside the CJS handlers resolves to the same instance
// imported here.
import { describe, test, expect } from 'vitest'
import { createRequire } from 'node:module'
import { CHANNEL_RULES } from '../../utils/ipcValidation'

// The handlers reach the mock via `require('electron')` (Module._load patch in
// tests/setup.js); importing the file through Vite would produce a second
// instance, so acquire it through the exact same require path.
const { ipcMain, __reset } = createRequire(import.meta.url)('electron')

import { setupAgentHandlers } from '../agentHandlers'
import { setupDesktopHandlers } from '../desktopHandlers'
import { setupPreviewHandlers } from '../previewHandlers'
import { setupProcessHandlers } from '../processHandlers'
import { setupProjectHandlers } from '../projectHandlers'
import { setupRepoHandlers } from '../repoHandlers'
import { setupDependencyHandlers } from '../dependencyHandlers'
import { setupSystemHandlers } from '../systemHandlers'
import { setupBackupHandlers } from '../backupHandlers'
import { setupTerminalHandlers } from '../terminalHandlers'

function registerAll() {
  const emitter = { on: () => {} }
  setupAgentHandlers(emitter, emitter, {}, () => null)
  setupProcessHandlers(emitter, emitter, null)
  setupProjectHandlers(emitter, emitter, null)
  setupDesktopHandlers()
  setupTerminalHandlers(null)
  setupPreviewHandlers({})
  setupRepoHandlers(emitter, emitter, null)
  setupDependencyHandlers()
  setupSystemHandlers()
  setupBackupHandlers(emitter, null, null)
  return [...ipcMain._handlers.keys()]
}

describe('IPC channel registry completeness', () => {
  test('every safeHandle channel has a central CHANNEL_RULES entry', () => {
    const channels = registerAll()
    expect(channels.length).toBeGreaterThan(90)
    const missing = channels.filter((channel) => !(channel in CHANNEL_RULES))
    expect(missing).toEqual([])
    __reset()
  })

  test('rule sets cover the positional args the renderer sends', () => {
    expect(CHANNEL_RULES['omp-set-model']).toHaveLength(4)
    expect(CHANNEL_RULES['omp-update-session-tokens']).toHaveLength(4)
    expect(CHANNEL_RULES['preview-set-bounds']).toHaveLength(2)
    expect(CHANNEL_RULES['git-commit']).toHaveLength(2)
  })
})
