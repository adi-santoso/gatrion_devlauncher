import { useEffect, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import { browseFolder, detectProjectType, type DetectTypeResult } from '../../data/projects'
import { EMPTY_PROJECT, TYPE_METADATA, type ProjectFormData } from './projectFormData'
import type { ProjectRuntime } from '../../hooks/useProjects'

export function useProjectForm(isOpen: boolean, project: ProjectRuntime | null, source: Record<string, unknown> | null) {
  const [formData, render] = useState<ProjectFormData>(EMPTY_PROJECT)
  const current = useRef(formData)
  const touched = useRef(new Set<keyof ProjectFormData>())
  const session = useRef(0), request = useRef(0)
  const [detection, setDetection] = useState<DetectTypeResult | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const commit = (next: ProjectFormData) => { current.current = next; render(next) }
  const setFormData = (action: SetStateAction<ProjectFormData>, syncedPrimary = false) => {
    const previous = current.current
    const next = typeof action === 'function' ? action(previous) : action
    for (const key of Object.keys(next) as Array<keyof ProjectFormData>) if (next[key] !== previous[key] && !(key === 'commands' && syncedPrimary)) touched.current.add(key)
    if (next.path !== previous.path) { request.current++; setIsDetecting(false); setDetection(null) }
    commit(next)
    setErrors({})
  }
  const analyzeFolder = async (rawPath: string) => {
    const path = rawPath.trim()
    const id = ++request.current, owner = session.current
    commit({ ...current.current, path })
    setIsDetecting(true); setDetection(null); setErrors({})
    try {
      const result = await detectProjectType(path)
      if (owner !== session.current || id !== request.current) return
      if (!result.success) { setErrors({ detection: result.error || 'Could not analyze project' }); setShowAdvanced(true); return }
      const detected: Partial<ProjectFormData> = {
        name: result.projectName || '', type: result.type || 'CUSTOM',
        port: result.defaultPort == null ? '' : String(result.defaultPort), startCommand: result.defaultCommand || '',
        commands: result.commands || [], emoji: result.icon || EMPTY_PROJECT.emoji, color: result.color || EMPTY_PROJECT.color,
      }
      const next = { ...current.current, path: result.path || path }
      for (const key of Object.keys(detected) as Array<keyof ProjectFormData>) {
        if (!touched.current.has(key)) Object.assign(next, { [key]: detected[key] })
      }
      // Legacy top-level fields are the editor source of truth for the primary.
      next.commands = next.commands.map(item => item.primary ? { ...item, command: next.startCommand, port: next.port ? Number(next.port) : null } : item)
      commit(next); setDetection(result)
    } catch (error) {
      if (owner === session.current && id === request.current) { setErrors({ detection: String(error instanceof Error ? error.message : error) }); setShowAdvanced(true) }
    } finally { if (owner === session.current && id === request.current) setIsDetecting(false) }
  }
  const projectId = project?.id
  const sourceKey = source ? JSON.stringify(source) : null
  useEffect(() => {
    session.current++; request.current++
    const data = project || source
    const next = { ...EMPTY_PROJECT, ...(data || {}), port: data?.port == null ? '' : String(data.port) } as ProjectFormData
    // Only form fields may cross the save boundary.
    const clean = Object.fromEntries(Object.keys(EMPTY_PROJECT).map(key => [key, next[key as keyof ProjectFormData]])) as unknown as ProjectFormData
    touched.current = new Set(project || source?.duplicate ? Object.keys(EMPTY_PROJECT) as Array<keyof ProjectFormData> : [])
    commit(clean); setDetection(null); setErrors({}); setIsDetecting(false); setShowAdvanced(Boolean(project || source?.duplicate))
    if (isOpen && source?.analyze && !project) void analyzeFolder(String(source.path || ''))
    const sessionRef = session, requestRef = request
    return () => { sessionRef.current++; requestRef.current++ }
    // A new modal session owns its async work; form edits never restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId, sourceKey])
  const handleBrowse = async () => {
    const owner = session.current, id = ++request.current
    setIsDetecting(true)
    try {
      const result = await browseFolder()
      if (owner !== session.current || id !== request.current) return
      if (result.success && result.path) await analyzeFolder(result.path)
      else if (!result.canceled) setErrors({ detection: result.error || 'Could not browse folders' })
    } catch (error) {
      if (owner === session.current && id === request.current) setErrors({ detection: String(error instanceof Error ? error.message : error) })
    } finally { if (owner === session.current && id === request.current) setIsDetecting(false) }
  }
  const handleChange = (field: keyof ProjectFormData, value: unknown) => setFormData(previous => {
    const next = { ...previous, [field]: value }
    if (field === 'type') Object.assign(next, TYPE_METADATA[String(value)] || {})
    if (field === 'startCommand' || field === 'port') next.commands = previous.commands.map(item => item.primary ? { ...item, command: field === 'startCommand' ? String(value) : item.command, port: field === 'port' ? (String(value).trim() ? Number(value) : null) : item.port } : item)
    return next
  }, field === 'startCommand' || field === 'port')
  return { formData, setFormData, handleChange, analyzeFolder, handleBrowse, detection, isDetecting, showAdvanced, setShowAdvanced, errors, setErrors, session, sessionKey: `${isOpen}:${projectId || ''}:${sourceKey || ''}` }
}
