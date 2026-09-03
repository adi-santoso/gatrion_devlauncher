import type { PreviewHost } from '../types/shared'

/**
 * Build the loopback URL used to reach a project's dev server (embedded
 * preview, "Open in browser", copy-URL). Defaults to `localhost` so legacy
 * projects without a `previewHost` field keep working.
 */
export function previewUrl(port: number | string | null | undefined, host?: PreviewHost | string | null): string | null {
  if (port == null || port === '' || !Number.isInteger(Number(port))) return null
  const safeHost = host === '127.0.0.1' ? '127.0.0.1' : 'localhost'
  return `http://${safeHost}:${port}`
}
