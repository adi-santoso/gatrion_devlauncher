export const PRESET_DEFAULT_COLOR = '#6D5EF5'
export const MAX_STAGGER_DELAY_MS = 60000
export const PRESET_COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/

export interface PresetRecord {
  id: string
  name: string
  description: string
  color: string
  projectIds: string[]
  startDelayMs: number
  autoStart: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Normalize a workspace preset, migrating legacy shapes (v1: id/name/projectIds/createdAt)
 * into the v2 shape and sanitizing every field. Returns null for entries without a valid name.
 * @param preset - Raw preset value
 * @param index - Position in the list (used for generated ids)
 */
export function normalizePreset(preset: unknown, index = 0): PresetRecord | null {
  if (!preset || typeof preset !== 'object') return null
  const raw = preset as Record<string, unknown>
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null

  const seen = new Set<string>()
  const projectIds = Array.isArray(raw.projectIds)
    ? raw.projectIds
      .filter((id: unknown) => typeof id === 'string' && id.trim())
      .map((id) => id.trim())
      .filter((id: string) => {
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
    : []

  const rawDelay = Number(raw.startDelayMs)
  const startDelayMs = Number.isFinite(rawDelay)
    ? Math.max(0, Math.min(MAX_STAGGER_DELAY_MS, Math.round(rawDelay)))
    : 0

  const now = new Date().toISOString()
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `preset-${Date.now()}-${index}`,
    name: raw.name.trim(),
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    color: typeof raw.color === 'string' && PRESET_COLOR_PATTERN.test(raw.color.trim()) ? raw.color.trim() : PRESET_DEFAULT_COLOR,
    projectIds,
    startDelayMs,
    autoStart: raw.autoStart === true,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  }
}
