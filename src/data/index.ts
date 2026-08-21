/**
 * Data-layer facade — the public API surface for renderer↔main IPC.
 *
 * Consumers may import from here directly, or keep using the legacy path
 * src/utils/ipcRenderer (a thin re-export of this module).
 */
export * from './ipcCore'
export * from './projects'
export * from './processes'
export * from './git'
export * from './dependencies'
export * from './config'
export * from './preview'
export * from './terminal'
export * from './agent'
export * from './system'
