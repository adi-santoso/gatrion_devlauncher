import { useState, useEffect, useCallback } from 'react'
import { getActivities, appendActivities } from '../utils/ipcRenderer'
import type { ActivityEntry } from '../data/config'

export interface ActivityItem {
  type: string
  project?: string
  message: string
  time: string
}

// Pure helper — kept at module scope so its identity is stable across renders.
const formatActivityTime = (timestamp: string | number | Date, detail = ''): string => {
  const date = new Date(timestamp)
  const base = Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
  return `${base}${detail ? ' · ' + detail : ''}`
}

/**
 * useActivities — recent-activity feed, persisted to disk via IPC and
 * hydrated once on mount.
 */
export const useActivities = () => {
  const [activities, setActivities] = useState<ActivityItem[]>([])

  const addActivity = useCallback((type: string, project: string, message: string, detail = '') => {
    const timestamp = new Date().toISOString()
    setActivities((prev) => [
      { type, project, message, time: formatActivityTime(timestamp, detail) },
      ...prev.slice(0, 19),
    ])
    appendActivities([{ type, project, message, detail, timestamp }]).catch(() => {})
  }, [])

  // Hydrate persisted activity feed once on mount
  useEffect(() => {
    let cancelled = false
    getActivities().then((result) => {
      if (cancelled || !result?.success || !Array.isArray(result.activities)) return
      setActivities(result.activities.slice(0, 20).map((entry: ActivityEntry) => ({
        type: entry.type,
        project: entry.project,
        message: entry.message,
        time: formatActivityTime(entry.timestamp, entry.detail),
      })))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  return { activities, addActivity }
}
