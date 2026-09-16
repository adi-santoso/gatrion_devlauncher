import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjects } from '../../hooks';
import DropdownMenu, { DropdownItem } from '../Common/DropdownMenu';
import AnimatedModal from '../Common/AnimatedModal';
import StackLogo from '../Common/StackLogo';
import TagsField, { type TagsFieldHandle } from './TagsField';
import EnvironmentFields from './EnvironmentFields';
import CustomCommandFields from './CustomCommandFields';
import { useDetailI18n } from '../ProjectDetail/useDetailI18n';
import { typeLabel, TYPE_LABELS } from '../../utils/typeLabels';
import type { ProjectRuntime } from '../../hooks/useProjects';
import type { DetectTypeResult } from '../../data/projects';
import { EMPTY_PROJECT, TYPE_METADATA, validateProjectForm, type ProjectFormData } from './projectFormData';

export type { ProjectFormData } from './projectFormData';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<{ success: boolean; error?: string } | void>;
  project?: ProjectRuntime | null;
  droppedProject?: Record<string, unknown> | null;
  allProjects?: ProjectRuntime[];
}

const ProjectModal = ({ isOpen, onClose, onSave, project = null, droppedProject = null, allProjects = [] }: ProjectModalProps) => {
  const t = useDetailI18n();
  const { browseFolder, detectProjectType } = useProjects();
  const detectionId = useRef(0);
  // Tracks the values the detector last wrote, so re-analysis only refills fields
  // that still hold the previous detection (i.e. were not edited manually).
  const lastDetected = useRef<Partial<ProjectFormData>>({});
  const [formData, setFormData] = useState<ProjectFormData>(EMPTY_PROJECT);
  const [detection, setDetection] = useState<DetectTypeResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isSaving, setIsSaving] = useState(false);
  const tagsFieldRef = useRef<TagsFieldHandle>(null);
  const isEditing = Boolean(project);

  // All tags already used by existing projects — offered as chips so a tag can
  // be picked instead of retyped (reused across projects consistently).
  const existingTags = useMemo(() => {
    const seen = new Set<string>();
    for (const p of allProjects) {
      for (const tag of p.tags || []) if (typeof tag === 'string' && tag.trim()) seen.add(tag.trim());
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [allProjects]);

  useEffect(() => {
    detectionId.current += 1;
    lastDetected.current = {};
    const source = (project || droppedProject) as Partial<ProjectFormData> | null | undefined;
    if (source) {
      setFormData({
        name: (source.name as string) || '',
        path: (source.path as string) || '',
        type: (source.type as string) || 'CUSTOM',
        port: source.port == null ? '' : String(source.port),
        startCommand: (source.startCommand as string) || '',
        commands: (source.commands as ProjectFormData['commands']) || [],
        envVars: (source.envVars as ProjectFormData['envVars']) || [],
        autoStart: Boolean(source.autoStart),
        emoji: (source.emoji as string) || '⚙️',
        color: (source.color as string) || '#6B7280',
        tags: (source.tags as string[]) || [],
        customCommands: (source.customCommands as ProjectFormData['customCommands']) || [],
        dependsOn: (source.dependsOn as string[]) || [],
        previewHost: (source.previewHost as ProjectFormData['previewHost']) || 'localhost',
      });
      setShowAdvanced(true);
      if (droppedProject && !project) {
        // A dropped folder arrives pre-detected (drop handler ran detectProjectType).
        // Seed "last detected" with those values so re-analysis (Browse / Change
        // folder) can still overwrite them — otherwise applyDetection treats the
        // non-empty prefill as a manual edit and the type stays CUSTOM.
        const seed: Partial<ProjectFormData> = {
          name: (source.name as string) || '',
          type: (source.type as string) || 'CUSTOM',
          port: source.port == null ? '' : String(source.port),
          startCommand: (source.startCommand as string) || '',
          commands: (source.commands as ProjectFormData['commands']) || [],
          emoji: (source.emoji as string) || '⚙️',
          color: (source.color as string) || '#6B7280',
        };
        lastDetected.current = seed;
      }
    } else {
      setFormData(EMPTY_PROJECT);
      // Seed "last detected" with fresh defaults so the FIRST detection can
      // overwrite non-empty EMPTY_PROJECT values that otherwise look edited.
      lastDetected.current = {
        name: EMPTY_PROJECT.name, type: EMPTY_PROJECT.type, port: EMPTY_PROJECT.port,
        startCommand: EMPTY_PROJECT.startCommand, commands: EMPTY_PROJECT.commands, emoji: EMPTY_PROJECT.emoji, color: EMPTY_PROJECT.color,
      };
      setShowAdvanced(false);
    }
    setDetection(null);
    setIsDetecting(false);
    setErrors({});
    setIsSaving(false);
  }, [project, droppedProject, isOpen]);

  const clearError = (field: string): void => {
    setErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const handleChange = (field: string, value: unknown): void => {
    setFormData((previous) => {
      if (field === 'startCommand' || field === 'port') {
        const commands = previous.commands.map((item) => item.primary
          ? { ...item, [field === 'startCommand' ? 'command' : 'port']: field === 'port' ? (String(value).trim() ? Number(value) : null) : value }
          : item);
        return { ...previous, [field]: value, commands };
      }
      if (field !== 'type') return { ...previous, [field]: value };
      const metadata = TYPE_METADATA[value as string] || {};
      return { ...previous, type: value as string, ...metadata };
    });
    clearError(field);
  };

  // Apply a detected value only to gaps: in edit mode never touch non-empty
  // fields (existing config wins); in create mode only fill empty fields or ones
  // still holding the previous detection (so manual edits are never overwritten).
  const applyDetection = (previous: ProjectFormData, field: keyof ProjectFormData, value: unknown): unknown => {
    if (value == null || value === '') return undefined;
    const current = previous[field];
    if (isEditing) return current === '' || current == null ? value : undefined;
    const untouched = current === '' || current == null || lastDetected.current[field] === current;
    return untouched ? value : undefined;
  };

  const analyzeFolder = async (projectPath: string): Promise<void> => {
    const currentDetectionId = ++detectionId.current;
    setIsDetecting(true);
    setDetection(null);
    setErrors((previous) => ({ ...previous, detection: undefined, path: undefined }));

    try {
      const result = await detectProjectType(projectPath);
      if (currentDetectionId !== detectionId.current) return;
      if (!result.success) {
        setErrors((previous) => ({ ...previous, detection: result.error || 'Could not analyze project' }));
        return;
      }

      setDetection(result);
      // Merge detection results into the form OUTSIDE the state updater: React
      // StrictMode (dev) invokes updater functions twice to surface impurity, so
      // writing `lastDetected` inside setFormData made the second invocation see
      // already-updated refs and skip legitimate fields (type stayed CUSTOM).
      const next = {
        ...formData,
        path: projectPath,
        name: (applyDetection(formData, 'name', result.projectName) as string) ?? formData.name,
        type: (applyDetection(formData, 'type', result.type || 'CUSTOM') as string) ?? formData.type,
        port: (applyDetection(formData, 'port', result.defaultPort == null ? '' : String(result.defaultPort)) as string) ?? formData.port,
        startCommand: (applyDetection(formData, 'startCommand', result.defaultCommand) as string) ?? formData.startCommand,
        commands: (applyDetection(formData, 'commands', result.commands) as ProjectFormData['commands']) ?? formData.commands,
        emoji: (applyDetection(formData, 'emoji', result.icon) as string) ?? formData.emoji,
        color: (applyDetection(formData, 'color', result.color) as string) ?? formData.color,
      };
      lastDetected.current = {
        name: next.name,
        type: next.type,
        port: next.port,
        startCommand: next.startCommand,
        commands: next.commands,
        emoji: next.emoji,
        color: next.color,
      };
      setFormData(next);
      if (!result.defaultCommand) setShowAdvanced(true);
    } catch (error) {
      if (currentDetectionId === detectionId.current) {
        setErrors((previous) => ({ ...previous, detection: (error instanceof Error ? error.message : String(error)) || 'Could not analyze project' }));
      }
    } finally {
      if (currentDetectionId === detectionId.current) setIsDetecting(false);
    }
  };

  const handleBrowse = async (): Promise<void> => {
    try {
      const response = await browseFolder();
      if (response.success && response.path) await analyzeFolder(response.path as string);
      if (!response.success && !response.canceled && response.error) {
        setErrors((previous) => ({ ...previous, detection: response.error }));
      }
    } catch (error) {
      setErrors((previous) => ({ ...previous, detection: (error instanceof Error ? error.message : String(error)) || 'Could not browse folders' }));
    }
  };

  const validateForm = (): boolean => {
    const nextErrors = validateProjectForm(formData);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) setShowAdvanced(true);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (): Promise<void> => {
    // Flush a tag typed but not yet committed (Enter not pressed) so it is not
    // lost on save — the synchronous handle also returns it for the payload.
    const finalTags = tagsFieldRef.current?.flush() ?? formData.tags;
    if (!validateForm()) return;
    setIsSaving(true);
    try {
      const result = await onSave({
        ...formData,
        tags: finalTags,
        port: formData.port.trim() ? Number(formData.port) : null,
        commands: formData.commands.map((item) => ({
          ...item,
          port: item.port == null || item.port === '' ? null : Number(item.port),
        })),
      });
      if (result && !result.success && result.error) {
        setErrors((previous) => ({ ...previous, form: result.error }));
      }
    } catch (error) {
      setErrors((previous) => ({ ...previous, form: (error instanceof Error ? error.message : String(error)) || 'Failed to save project' }));
    } finally {
      setIsSaving(false);
    }
  };

  const hasSelectedFolder = Boolean(formData.path);
  const showConfiguration = isEditing || showAdvanced;

  return (
    <AnimatedModal id="projectModal" isOpen={isOpen} onClose={onClose}>
        <div className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-card max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <div>
              <h3 className="font-display font-bold text-sm">{t(isEditing ? 'Edit Project' : 'Add Project')}</h3>
              <p className="text-xs text-ink-faint mt-0.5">
                {t(isEditing ? 'Update project launch configuration.' : 'Choose a folder and Gatrion will configure it.')}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label={t('Close')} className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors">✕</button>
          </div>

          <div className="px-5 py-5 space-y-4 overflow-y-auto">
            {!isEditing && !hasSelectedFolder && (
              <div className="rounded-xl border border-dashed border-border bg-surface-2/50 px-6 py-9 text-center">
                <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-2xl">⌁</div>
                <p className="text-sm font-semibold text-ink">{t('Select your project folder')}</p>
                <p className="text-xs text-ink-faint mt-1.5 max-w-xs mx-auto leading-relaxed">
                  {t('Framework, package manager, start command, and port will be detected automatically.')}
                </p>
                <button type="button" onClick={handleBrowse} disabled={isDetecting} className="mt-5 px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors disabled:opacity-50">
                  {t(isDetecting ? 'Analyzing Project...' : 'Browse Project Folder')}
                </button>
              </div>
            )}

            {!isEditing && hasSelectedFolder && (
              <div className="rounded-xl border border-border bg-surface-2 overflow-hidden">
                <div className="p-4 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-ink-soft shrink-0">
                    <StackLogo type={formData.type} size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">{formData.name}</p>
                        <p className="text-[11px] text-success mt-0.5">
                          {detection && formData.type === detection.type
                            ? t('Detected as {type}', { type: detection.name })
                            : t('Configured as {type}', { type: typeLabel(formData.type) })}
                        </p>
                      </div>
                      <button type="button" onClick={handleBrowse} disabled={isDetecting} className="text-[11px] font-medium text-accent hover:text-accent-hover shrink-0">
                        {t(isDetecting ? 'Analyzing...' : 'Change folder')}
                      </button>
                    </div>
                    <p className="text-[11px] font-mono text-ink-faint truncate mt-2">{formData.path}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 border-t border-border text-xs">
                  <div className="px-4 py-3 border-r border-border">
                    <p className="text-[10px] uppercase tracking-wider text-ink-faint">{t('Package manager')}</p>
                    <p className="text-ink mt-1 font-mono">{detection?.packageManager || t('Not required')}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink-faint">Port</p>
                    <p className="text-ink mt-1 font-mono">{formData.port || t('Not monitored')}</p>
                  </div>
                  <div className="col-span-2 px-4 py-3 border-t border-border">
                    <p className="text-[10px] uppercase tracking-wider text-ink-faint">{t('Start command')}</p>
                    <p className={`mt-1 font-mono ${formData.startCommand ? 'text-ink' : 'text-warning'}`}>{formData.startCommand || t('Needs configuration')}</p>
                  </div>
                  {formData.commands.length > 1 && formData.commands.filter((item) => !item.primary).map((item) => (
                    <div key={item.id} className="col-span-2 px-4 py-3 border-t border-border">
                      <p className="text-[10px] uppercase tracking-wider text-ink-faint">{item.name}</p>
                      <p className="text-ink mt-1 font-mono">{item.command}</p>
                      <p className="text-[11px] text-ink-faint mt-1">{item.port ? `Port ${item.port}` : t('No port monitoring')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isDetecting && hasSelectedFolder && <p role="status" className="text-xs text-accent">{t('Analyzing project configuration...')}</p>}
            {errors.detection && <p role="alert" className="text-xs text-danger">{t(errors.detection)}</p>}
            {detection?.warnings?.map((warning) => <p key={warning} className="text-[11px] text-warning">{warning}</p>)}

            {!isEditing && hasSelectedFolder && (
              <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="w-full flex items-center justify-between py-1 text-xs font-medium text-ink-soft hover:text-ink">
                <span>{t('Advanced Settings')}</span>
                <span>{showAdvanced ? '−' : '+'}</span>
              </button>
            )}

            {showConfiguration && (
              <div className="space-y-4 pt-1">
                <div>
                  <label htmlFor="project-name" className="text-xs text-ink-soft mb-1.5 block">{t('Project name')} <span className="text-danger">*</span></label>
                  <input id="project-name" type="text" value={formData.name} onChange={(event) => handleChange('name', event.target.value)} className={`w-full bg-surface-3 border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40 ${errors.name ? 'border-danger' : 'border-border'}`} />
                  {errors.name && <p role="alert" className="text-[11px] text-danger mt-1">{t(errors.name)}</p>}
                </div>
                <div>
                  <label htmlFor="project-path" className="text-xs text-ink-soft mb-1.5 block">{t('Project path')} <span className="text-danger">*</span></label>
                  <div className="flex gap-2">
                    <input id="project-path" type="text" value={formData.path} onChange={(event) => handleChange('path', event.target.value)} className={`flex-1 min-w-0 bg-surface-3 border rounded-lg px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40 ${errors.path ? 'border-danger' : 'border-border'}`} />
                    <button type="button" onClick={handleBrowse} disabled={isDetecting} className="px-3 py-2 rounded-lg bg-surface-3 border border-border text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-50">{t('Browse...')}</button>
                  </div>
                  {errors.path && <p role="alert" className="text-[11px] text-danger mt-1">{t(errors.path)}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-ink-soft mb-1.5 block">{t('Project type')}</label>
                    <DropdownMenu
                      trigger={(
                        <button type="button" className="w-full flex items-center gap-2 bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40">
                          <StackLogo type={formData.type} size={16} />
                          <span className="flex-1 text-left">{typeLabel(formData.type)}</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint" aria-hidden="true">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                      )}
                    >
                      {Object.entries(TYPE_LABELS).map(([value, label]) => (
                        <DropdownItem key={value} onClick={() => handleChange('type', value)}>
                          <StackLogo type={value} size={14} />
                          {label}
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </div>
                  <div>
                    <label htmlFor="project-port" className="text-xs text-ink-soft mb-1.5 block">Port <span className="text-ink-faint">{t('(optional)')}</span></label>
                    <input id="project-port" type="text" placeholder={t('No port monitoring')} value={formData.port} onChange={(event) => handleChange('port', event.target.value)} className={`w-full bg-surface-3 border rounded-lg px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40 ${errors.port ? 'border-danger' : 'border-border'}`} />
                    {errors.port && <p role="alert" className="text-[11px] text-danger mt-1">{t(errors.port)}</p>}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-ink-soft mb-1.5 block">{t('Preview host')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleChange('previewHost', 'localhost')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${formData.previewHost === 'localhost' ? 'bg-accent/15 text-ink border-accent/30' : 'bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border-border'}`}
                    >
                      localhost
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChange('previewHost', '127.0.0.1')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${formData.previewHost === '127.0.0.1' ? 'bg-accent/15 text-ink border-accent/30' : 'bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border-border'}`}
                    >
                      127.0.0.1
                    </button>
                  </div>
                  <p className="text-[11px] text-ink-faint mt-1">{t('Host used to reach the dev server for embedded preview & "Open in browser".')}</p>
                </div>
                <div>
                  <label htmlFor="project-command" className="text-xs text-ink-soft mb-1.5 block">{t('Start command')} <span className="text-danger">*</span></label>
                  <input id="project-command" type="text" value={formData.startCommand} onChange={(event) => handleChange('startCommand', event.target.value)} className={`w-full bg-surface-3 border rounded-lg px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40 ${errors.startCommand ? 'border-danger' : 'border-border'}`} />
                  {errors.startCommand && <p role="alert" className="text-[11px] text-danger mt-1">{t(errors.startCommand)}</p>}
                </div>
                {formData.commands.filter((item) => !item.primary).map((item) => (
                  <div key={item.id} className="rounded-lg border border-border bg-surface-2 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-ink">{item.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-accent">{t('Additional process')}</span>
                        <button type="button" onClick={() => setFormData((previous) => ({ ...previous, commands: previous.commands.filter((cmd) => cmd.id !== item.id) }))} className="w-6 h-6 flex items-center justify-center rounded-md text-ink-faint hover:text-danger hover:bg-danger/10 transition-colors" aria-label="Remove additional process" title="Remove">✕</button>
                      </div>
                    </div>
                    <input type="text" value={item.command} onChange={(event) => setFormData((previous) => ({ ...previous, commands: previous.commands.map((command) => command.id === item.id ? { ...command, command: event.target.value } : command) }))} className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" />
                    <input type="text" placeholder="No port monitoring" value={item.port ?? ''} onChange={(event) => setFormData((previous) => ({ ...previous, commands: previous.commands.map((command) => command.id === item.id ? { ...command, port: event.target.value } : command) }))} className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" />
                  </div>
                ))}
                {errors.commands && <p role="alert" className="text-[11px] text-danger">{t(errors.commands)}</p>}
                <EnvironmentFields key={`${isOpen}:${project?.id || 'new'}`} values={formData.envVars} onChange={envVars => setFormData(previous => ({ ...previous, envVars }))} />
                <div className="flex items-center justify-between pt-1">
                  <div><p className="text-xs text-ink">{t('Start on app launch')}</p><p className="text-[11px] text-ink-faint">{t('Auto-run this project when Gatrion opens.')}</p></div>
                  <button type="button" role="switch" aria-checked={formData.autoStart} aria-label={t('Start on app launch')} onClick={() => handleChange('autoStart', !formData.autoStart)} className={`w-9 h-5 rounded-full relative shrink-0 ${formData.autoStart ? 'bg-accent' : 'bg-surface-3 border border-border'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${formData.autoStart ? 'right-0.5' : 'left-0.5'}`}></span></button>
                </div>
                <TagsField ref={tagsFieldRef} tags={formData.tags} existingTags={existingTags} onChange={(tags) => setFormData((p) => ({ ...p, tags }))} />
                <CustomCommandFields values={formData.customCommands} onChange={customCommands => setFormData(previous => ({ ...previous, customCommands }))} />
                {allProjects.length > 0 && (
                  <div>
                    <label className="text-xs text-ink-soft mb-1.5 block">{t('Depends on')}</label>
                    <div className="flex flex-wrap gap-2">
                      {allProjects.filter((p) => p.id !== project?.id).map((p) => (
                        <button key={p.id} type="button" onClick={() => setFormData((prev) => ({ ...prev, dependsOn: prev.dependsOn.includes(p.id) ? prev.dependsOn.filter((id) => id !== p.id) : [...prev.dependsOn, p.id] }))} className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${formData.dependsOn.includes(p.id) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-surface-3 border-border text-ink-soft hover:text-ink'}`}>{p.name}</button>
                      ))}
                    </div>
                    <p className="text-[10px] text-ink-faint mt-1">{t('These projects will start before this one.')}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
            {errors.form && <p role="alert" className="mr-auto text-xs text-danger">{t(errors.form)}</p>}
            <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm font-medium transition-colors">{t('Cancel')}</button>
            {(isEditing || hasSelectedFolder) && (
              <button type="button" onClick={handleSubmit} disabled={isSaving || isDetecting} className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors disabled:opacity-50">
                {t(isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Project')}
              </button>
            )}
          </div>
        </div>
    </AnimatedModal>
  );
};

export default ProjectModal;
