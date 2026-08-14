/**
 * Ambient types for the preload bridge exposed on `window.electron`.
 *
 * The preload (electron/preload.ts) exposes thin pass-through wrappers over
 * ipcRenderer; every channel validates its payload at the boundary, so the
 * bridge is intentionally loosely typed here. The domain data layer
 * (src/data/*) narrows each call to the concrete IPC contract at the
 * call site — see `invoke` / `subscribe` in src/data/ipcCore.ts.
 */
declare global {
  interface Window {
    electron: Record<string, (...args: unknown[]) => unknown>
  }
}

export {}
