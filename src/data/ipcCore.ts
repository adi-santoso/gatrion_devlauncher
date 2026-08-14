/**
 * Core IPC helpers — the single entry point to the preload bridge.
 *
 * Every bridge method is `unknown`-typed because each IPC channel validates
 * its payload at the boundary (assertPayload in the main process). Domain
 * modules (src/data/<domain>.ts) narrow the contract by passing the expected
 * result type as the generic argument to `invoke`, and by casting the
 * unsubscribe handle returned by `subscribe`.
 */

/** Minimal success envelope used across most IPC channels. */
export interface SimpleResult {
  success: boolean
  error?: string
}

/** True when running inside Electron (preload exposed `window.electron`). */
export const isElectron = (): boolean =>
  typeof window !== 'undefined' && window.electron !== undefined

/** Alias kept for callers that check bridge availability explicitly. */
export const isElectronAvailable = isElectron

/**
 * Invoke an IPC channel through the preload bridge.
 * @param method - channel name (must exist on the preload bridge)
 * @param args - payload arguments (validated at the boundary)
 * @returns the bridge result narrowed to `T`
 */
export function invoke<T>(method: string, ...args: unknown[]): Promise<T> {
  const fn = window.electron[method] as (...a: unknown[]) => Promise<T>
  return fn(...args)
}

/**
 * Subscribe to a push channel through the preload bridge.
 * @param method - channel name (must exist on the preload bridge)
 * @param callback - invoked with the pushed payload (or payloads)
 * @returns an unsubscribe function; a no-op when the bridge is absent
 */
export function subscribe(method: string, callback: (...args: unknown[]) => void): () => void {
  const fn = window.electron[method] as (cb: (...args: unknown[]) => void) => unknown
  const result = fn(callback)
  return typeof result === 'function' ? (result as () => void) : () => {}
}
