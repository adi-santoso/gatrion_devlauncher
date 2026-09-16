import { useEffect, useMemo, useRef, useState } from 'react'
import AnimatedModal from '../Common/AnimatedModal'
import TagsField, { type TagsFieldHandle } from './TagsField'
import EnvironmentFields from './EnvironmentFields'
import CustomCommandFields from './CustomCommandFields'
import { useDetailI18n } from '../ProjectDetail/useDetailI18n'
import { TYPE_LABELS } from '../../utils/typeLabels'
import type { ProjectRuntime } from '../../hooks/useProjects'
import type { Project } from '../../types/shared'
import { validateProjectForm } from './projectFormData'
import { dependencyError } from '../../utils/projectValidation'
import { useProjectForm } from './useProjectForm'
import ProjectFolderSummary from './ProjectFolderSummary'
export type { ProjectFormData } from './projectFormData'

export interface ProjectSaveResult { success: boolean; error?: string; fieldErrors?: Record<string, string>; existingProjectId?: string; project?: Project }
interface ProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: Record<string, unknown>) => Promise<ProjectSaveResult | void>
  project?: ProjectRuntime | null
  droppedProject?: Record<string, unknown> | null
  allProjects?: ProjectRuntime[]
  onOpenProject?: (project: Project) => void
  onStartProject?: (project: Project) => void
}
const inputClass = 'w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40'
const buttonClass = 'px-3 py-2 rounded-lg border border-border bg-surface-3 text-xs font-medium disabled:opacity-50'

export default function ProjectModal({ isOpen, onClose, onSave, project = null, droppedProject = null, allProjects = [], onOpenProject, onStartProject }: ProjectModalProps) {
  const t = useDetailI18n()
  const { formData, setFormData, handleChange, analyzeFolder, handleBrowse, detection, isDetecting, showAdvanced, setShowAdvanced, errors, setErrors, session, sessionKey } = useProjectForm(isOpen, project, droppedProject)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState<Project | null>(null)
  const [copyMessage, setCopyMessage] = useState('')
  const [dependencySearch, setDependencySearch] = useState('')
  const [conflictId, setConflictId] = useState<string | undefined>()
  const saving = useRef(false), tagsFieldRef = useRef<TagsFieldHandle>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const isEditing = Boolean(project), hasFolder = Boolean(formData.path.trim())
  const existingTags = useMemo(() => [...new Set(allProjects.flatMap(p => p.tags || []))].sort(), [allProjects])
  const duplicate = allProjects.find(p => p.id !== project?.id && (p.id === (conflictId || detection?.existingProjectId) || (hasFolder && p.path?.replace(/\\/g, '/').replace(/\/$/, '') === formData.path.replace(/\\/g, '/').replace(/\/$/, ''))))
  useEffect(() => { setIsSaving(false); saving.current = false; setSaved(null); setCopyMessage(''); setDependencySearch('') }, [sessionKey])
  useEffect(() => { setConflictId(undefined) }, [sessionKey, formData.path, formData.name])
  const focusError = () => requestAnimationFrame(() => { const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]'); el?.focus(); el?.scrollIntoView({ block: 'center' }) })
  const submit = async () => {
    if (saving.current || isDetecting) return
    const tags = tagsFieldRef.current?.flush() ?? formData.tags
    const nextErrors = validateProjectForm(formData)
    if (allProjects.some(p => p.id !== project?.id && p.name.trim().toLowerCase() === formData.name.trim().toLowerCase())) nextErrors.name = 'A project with this name already exists'
    if (duplicate) nextErrors.path = 'This folder is already registered'
    const graphError = dependencyError(project?.id || 'new-project', formData.dependsOn, allProjects)
    if (graphError) nextErrors.dependsOn = graphError
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) { setShowAdvanced(true); focusError(); return }
    const owner = session.current
    saving.current = true; setIsSaving(true)
    try {
      const result = await onSave({ ...formData, tags, path: formData.path.trim(), port: formData.port.trim() ? Number(formData.port) : null,
        envVars: formData.envVars.map(({ needsValue: _needsValue, ...item }) => item),
        commands: formData.commands.map(item => ({ ...item, port: item.port == null || item.port === '' ? null : Number(item.port) })),
      })
      if (owner !== session.current) return
      if (result && !result.success) {
        setConflictId(result.fieldErrors?.path ? result.existingProjectId : undefined)
        setErrors(result.fieldErrors || { form: result.error || 'Failed to save project' }); setShowAdvanced(true); focusError()
      } else if (result?.project && onOpenProject && !isEditing) setSaved(result.project)
      else onClose()
    } catch (error) {
      if (owner === session.current) setErrors({ form: error instanceof Error ? error.message : String(error) })
    } finally { if (owner === session.current) { saving.current = false; setIsSaving(false) } }
  }
  const fieldError = (field: string) => errors[field] ? <p id={`error-${field}`} role="alert" className="text-xs text-danger mt-1">{t(errors[field]!)}</p> : null
  const invalid = (field: string) => ({ 'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `error-${field}` : undefined })
  const copyPath = async () => { try { await navigator.clipboard.writeText(formData.path); setCopyMessage('Path copied') } catch { setCopyMessage('Could not copy path') } }

  return <AnimatedModal id="projectModal" isOpen={isOpen} onClose={onClose} labelledBy="project-modal-title" initialFocus={isEditing ? '#project-name' : '#browse-project'}>
    <form ref={formRef} onSubmit={event => { event.preventDefault(); void submit() }} noValidate className="w-full max-w-xl bg-surface border border-border rounded-xl shadow-card max-h-[90vh] flex flex-col">
      <header className="flex justify-between items-start px-5 py-4 border-b border-border shrink-0">
        <div><h3 id="project-modal-title" className="font-display font-bold text-sm">{t(isEditing ? 'Edit Project' : 'Add Project')}</h3><p className="text-xs text-ink-faint mt-1">{t(isEditing ? 'Update project launch configuration.' : 'Choose a folder and review its launch settings.')}</p></div>
        <button type="button" aria-label={t('Close')} onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-surface-3">×</button>
      </header>
      {saved ? <section className="p-5 space-y-4">
        <p role="status">{t('Project {name} saved', { name: saved.name })}</p><p className="text-xs text-ink-soft">{t('Configuration saved. Start the project when you are ready.')}</p>
        <div className="flex gap-2"><button type="button" className={buttonClass} onClick={() => { onClose(); onOpenProject?.(saved) }}>{t('Open project')}</button><button type="button" className={buttonClass} onClick={() => { onClose(); onOpenProject?.(saved); onStartProject?.(saved) }}>{t('Start Project')}</button></div>
      </section> : <div className="overflow-y-auto px-5 py-4 min-h-0">
        <fieldset disabled={isSaving} className="space-y-4 min-w-0">
          {droppedProject?.duplicate === true && <p role="status" className="text-xs text-accent">{t('Copy configuration to a different folder. Re-enter stored secrets.')}</p>}
          <div>
            <label htmlFor="project-path" className="text-xs text-ink-soft block mb-1">{t('Project path')} *</label>
            <div className="flex gap-2"><input id="project-path" {...invalid('path')} value={formData.path} onChange={e => handleChange('path', e.target.value)} placeholder={t('Paste a folder path')} className={`${inputClass} flex-1 min-w-0 font-mono`} /><button id="browse-project" type="button" disabled={isDetecting} onClick={handleBrowse} className={`${buttonClass} shrink-0`}>{t(isDetecting ? 'Analyzing...' : hasFolder ? 'Change folder' : 'Browse Project Folder')}</button></div>
            {fieldError('path')}
            {hasFolder && <div className="flex gap-3 mt-2 text-xs"><button type="button" disabled={isDetecting} onClick={() => analyzeFolder(formData.path)} className="text-accent disabled:opacity-50">{t('Analyze folder')}</button><button type="button" onClick={copyPath}>{t('Copy path')}</button><span role="status">{t(copyMessage)}</span></div>}
          </div>
          {isDetecting && <p role="status" className="text-xs text-accent">{t('Analyzing project configuration...')}</p>}
          {errors.detection && <p role="alert" className="text-xs text-danger">{t(errors.detection)} {t('You can configure this folder manually or retry.')}</p>}
          {duplicate && <div role="status" className="text-xs text-warning">{t('This folder is already registered')} — {duplicate.name} {onOpenProject && <button type="button" className="underline" onClick={() => { onClose(); onOpenProject(duplicate) }}>{t('Open project')}</button>}</div>}
          <ProjectFolderSummary detection={detection} type={formData.type} compact={showAdvanced} />
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label htmlFor="project-name" className="text-xs text-ink-soft block mb-1">{t('Project name')} *</label><input id="project-name" {...invalid('name')} value={formData.name} onChange={e => handleChange('name', e.target.value)} className={inputClass} />{fieldError('name')}</div>
            <div><label htmlFor="project-type" className="text-xs text-ink-soft block mb-1">{t('Project type')}</label><select id="project-type" className={inputClass} value={formData.type} onChange={e => handleChange('type', e.target.value)}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div><label htmlFor="project-port" className="text-xs text-ink-soft block mb-1">{t('Port')} {t('(optional)')}</label><input id="project-port" {...invalid('port')} value={formData.port} inputMode="numeric" placeholder={t('No port monitoring')} onChange={e => handleChange('port', e.target.value)} className={inputClass} />{fieldError('port')}</div>
          </div>
          <p className="text-xs text-ink-faint">{t('Leave port empty for a worker or CLI. A port monitors readiness and preview; edit the command to change its listening port.')}</p>
          {/artisan\s+serve\b/i.test(formData.startCommand) && <p className="text-xs text-ink-faint">{t('Artisan serve uses this port unless the command already specifies --port.')}</p>}
          <div><label htmlFor="project-command" className="text-xs text-ink-soft block mb-1">{t('Start command')} *</label><input id="project-command" {...invalid('startCommand')} value={formData.startCommand} onChange={e => handleChange('startCommand', e.target.value)} className={`${inputClass} font-mono`} />{fieldError('startCommand')}</div>
          <button type="button" aria-expanded={showAdvanced} aria-controls="project-advanced" onClick={() => setShowAdvanced(!showAdvanced)} className="w-full text-left text-xs font-semibold text-ink-soft">{t('Advanced Settings')} <span aria-hidden="true">{showAdvanced ? '−' : '+'}</span></button>
          {showAdvanced && <div id="project-advanced" className="space-y-4">
            <div role="group" aria-label={t('Preview host')}><p className="text-xs text-ink-soft mb-2">{t('Preview host')}</p><div className="flex gap-2">{(['localhost', '127.0.0.1'] as const).map(host => <button key={host} type="button" aria-pressed={formData.previewHost === host} onClick={() => handleChange('previewHost', host)} className={`${buttonClass} ${formData.previewHost === host ? 'bg-accent/15' : ''}`}>{host}</button>)}</div></div>
            <section aria-label={t('Additional processes')} className="space-y-2">
              <p className="text-xs text-ink-soft">{t('Additional processes')}</p>
              {formData.commands.filter(item => !item.primary).map(item => <div key={item.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex justify-between"><span className="text-xs">{item.name}</span><button type="button" aria-label={t('Remove additional process')} onClick={() => setFormData(p => ({ ...p, commands: p.commands.filter(c => c.id !== item.id) }))}>×</button></div>
                <input aria-label={`${t('Start command')} ${item.name}`} {...invalid(`command.${item.id}`)} className={inputClass} value={item.command} onChange={e => setFormData(p => ({ ...p, commands: p.commands.map(c => c.id === item.id ? { ...c, command: e.target.value } : c) }))} />{fieldError(`command.${item.id}`)}
                <input aria-label={`${t('Port')} ${item.name}`} {...invalid(`port.${item.id}`)} className={inputClass} placeholder={t('No port monitoring')} value={item.port ?? ''} onChange={e => setFormData(p => ({ ...p, commands: p.commands.map(c => c.id === item.id ? { ...c, port: e.target.value } : c) }))} />{fieldError(`port.${item.id}`)}
              </div>)}
              <button type="button" className="text-xs text-accent" onClick={() => setFormData(p => ({ ...p, commands: [...(p.commands.length ? p.commands : [{ id: 'main', name: 'Application', command: p.startCommand, port: p.port ? Number(p.port) : null, primary: true }]), { id: crypto.randomUUID(), name: `${t('Additional process')} ${p.commands.length + 1}`, command: '', port: null, primary: false }] }))}>{t('Add process')}</button>{fieldError('commands')}
            </section>
            <EnvironmentFields key={`${isOpen}:${project?.id || 'new'}`} values={formData.envVars} errors={errors} onChange={envVars => setFormData(p => ({ ...p, envVars }))} />
            <p className="text-xs text-ink-faint">{t('These variables override the launch environment. They do not edit .env files.')}</p>
            <div className="flex justify-between"><span className="text-xs">{t('Start on app launch')}</span><button type="button" role="switch" aria-checked={formData.autoStart} aria-label={t('Start on app launch')} onClick={() => handleChange('autoStart', !formData.autoStart)} className={buttonClass}>{t(formData.autoStart ? 'Enabled' : 'Disabled')}</button></div>
            <TagsField ref={tagsFieldRef} tags={formData.tags} existingTags={existingTags} onChange={tags => setFormData(p => ({ ...p, tags }))} />
            <CustomCommandFields values={formData.customCommands} errors={errors} onChange={customCommands => setFormData(p => ({ ...p, customCommands }))} />
            {(allProjects.length > 0 || formData.dependsOn.length > 0) && <div role="group" aria-label={t('Depends on')}><p className="text-xs text-ink-soft">{t('Depends on')}</p><input {...invalid('dependsOn')} aria-label={t('Search projects')} value={dependencySearch} onChange={e => setDependencySearch(e.target.value)} className={`${inputClass} my-2`} /><div className="flex flex-wrap gap-2">{allProjects.filter(p => p.id !== project?.id && p.name.toLowerCase().includes(dependencySearch.toLowerCase())).map(p => <button key={p.id} type="button" aria-pressed={formData.dependsOn.includes(p.id)} onClick={() => handleChange('dependsOn', formData.dependsOn.includes(p.id) ? formData.dependsOn.filter(id => id !== p.id) : [...formData.dependsOn, p.id])} className={buttonClass}>{p.name}</button>)}</div>{formData.dependsOn.some(id => !allProjects.some(p => p.id === id)) && <button type="button" className={buttonClass} onClick={() => handleChange('dependsOn', formData.dependsOn.filter(id => allProjects.some(p => p.id === id)))}>{t('Remove missing dependencies')}</button>}<p className="text-xs text-ink-faint mt-2">{t('Dependencies must be ready before this project starts.')}</p>{fieldError('dependsOn')}</div>}
          </div>}
        </fieldset>
      </div>}
      <footer className="px-5 py-3 border-t border-border shrink-0 space-y-2">
        {errors.form && <p role="alert" className="text-xs text-danger break-words">{t(errors.form)}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={`${buttonClass} shrink-0 whitespace-nowrap`}>{t(saved ? 'Done' : 'Cancel')}</button>{!saved && <button type="submit" disabled={isSaving || isDetecting} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold shrink-0 whitespace-nowrap disabled:opacity-50">{t(isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Project')}</button>}</div>
      </footer>
    </form>
  </AnimatedModal>
}
