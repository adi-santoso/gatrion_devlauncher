import { useState } from 'react'
import { dragRegion } from './windowChrome'
import { PrayerCard, PrayerIcon } from './PrayerWidget'
import type { PrayerConfig } from './PrayerWidget'
import type { PrayerTimesResult } from '../../hooks/usePrayerTimes'
import { useI18n } from '../../i18n/I18nContext'
import type { ReactNode } from 'react'

interface NavItem {
  id: string
  labelKey: string
  icon: ReactNode
}

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    labelKey: 'nav.dashboard',
    icon: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>
  },
  {
    id: 'projects',
    labelKey: 'nav.projects',
    icon: <><path d="M3 7h6l2 2h10v11H3z" /><path d="M3 7V4h7l2 3" /></>
  },
  {
    id: 'terminals',
    labelKey: 'nav.terminals',
    icon: <><path d="M4 17l6-5-6-5" /><path d="M12 19h8" /></>
  },
  {
    id: 'agent',
    labelKey: 'nav.agent',
    icon: <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></>
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    icon: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 01-.1 1l2 1.5-2 3.5-2.5-1A7 7 0 0115 18l-.4 3h-4l-.4-3a7 7 0 01-1.6-1L6 18l-2-3.5L6 13a7 7 0 010-2L4 9.5 6 6l2.6 1A7 7 0 0110 6l.4-3h4l.4 3a7 7 0 011.6 1L19 6l2 3.5-2 1.5a7 7 0 010 1z" /></>
  }
]

export interface SidebarProject {
  id?: string
  name: string
  type?: string
  status?: string
  exitCode?: number | null
  onClick?: () => void
}

interface ProjectGroupProps {
  title: string
  projects: SidebarProject[]
  collapsed: boolean
  status: string
  onProjectSelect?: (project: SidebarProject) => void
}

const ProjectGroup = ({ title, projects, collapsed, status, onProjectSelect }: ProjectGroupProps) => {
  if (projects.length === 0) return null

  return (
    <section className="mt-4">
      {!collapsed && (
        <div className="flex items-center justify-between px-3 pb-1.5 text-[9px] font-mono font-semibold uppercase tracking-[0.12em] text-ink-faint">
          <span>{title}</span>
          <span>{projects.length}</span>
        </div>
      )}
      <div className="space-y-0.5">
        {projects.map((project) => (
          <button
            key={project.id || project.name}
            type="button"
            onClick={() => project.onClick ? project.onClick() : onProjectSelect?.(project)}
            title={project.name}
            className={`w-full grid items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-surface-3 transition-colors ${collapsed ? 'grid-cols-1 justify-items-center' : 'grid-cols-[8px_minmax(0,1fr)_auto]'}`}
          >
            <span className={`w-2 h-2 rounded-full ${status === 'error' ? 'bg-danger' : 'bg-success shadow-[0_0_10px_rgba(74,222,128,0.4)]'}`} />
            {!collapsed && <span className="truncate text-xs font-medium text-ink-soft">{project.name}</span>}
            {!collapsed && <span className="text-[8px] font-mono uppercase text-ink-faint">{status === 'error' ? (project.exitCode != null ? `exit ${project.exitCode}` : 'error') : (project.type || 'app')}</span>}
          </button>
        ))}
      </div>
    </section>
  )
}

interface SidebarProps {
  collapsed?: boolean
  onToggleCollapse?: (collapsed: boolean) => void
  activeView?: string
  onViewChange?: (view: string, project?: unknown) => void
  projects?: SidebarProject[]
  runningProjects?: SidebarProject[]
  onProjectSelect?: (project: SidebarProject) => void
  onAddProject?: () => void
  defaultCollapsed?: boolean
  prayer?: PrayerConfig | null
  prayerData?: PrayerTimesResult | null
  onPrayerExpand?: () => void
}

const Sidebar = ({
  collapsed,
  onToggleCollapse,
  activeView = 'dashboard',
  onViewChange,
  projects = [],
  runningProjects = [],
  onProjectSelect,
  onAddProject,
  defaultCollapsed = false,
  prayer = null,
  prayerData = null,
  onPrayerExpand
}: SidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(
    collapsed !== undefined ? collapsed : defaultCollapsed
  )

  const { t } = useI18n()

  const sourceProjects = projects.length > 0 ? projects : runningProjects
  const running = sourceProjects.filter((project) => !project.status || project.status.toLowerCase() === 'running')
  const errors = projects.filter((project) => project.status?.toLowerCase() === 'error')

  const toggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    onToggleCollapse?.(newState)
  }

  return (
    <aside
      className={`${isCollapsed ? 'w-[68px]' : 'w-[238px]'} shrink-0 bg-surface border-r border-border flex flex-col transition-[width] duration-200`}
      role="navigation"
      aria-label={t('nav.main')}
    >
      <div className="h-[66px] flex items-center gap-2.5 px-4 border-b border-border overflow-hidden" style={dragRegion}>
        <div className="w-[34px] h-[34px] rounded-[10px] bg-accent flex items-center justify-center shadow-glow shrink-0" role="img" aria-label="Gatrion logo">
          <svg width="15" height="15" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9z" fill="white" /></svg>
        </div>
        {!collapsed && <div className="min-w-0"><strong className="block font-display font-extrabold text-sm">Gatrion</strong><span className="block text-[8px] font-mono uppercase tracking-[0.12em] text-ink-faint">Local workspace</span></div>}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3.5 flex flex-col">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const label = t(item.labelKey)
            const isActive = activeView === item.id
            const count = item.id === 'projects' ? projects.length : item.id === 'terminals' ? running.length : null
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onViewChange?.(item.id)}
                title={`${label}${count !== null ? ` (${count})` : ''}`}
                aria-label={label}
                className={`relative w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${isCollapsed ? 'justify-center' : ''} ${isActive ? 'bg-accent/10 text-ink border border-accent/20' : 'text-ink-soft hover:bg-surface-3 hover:text-ink border border-transparent'}`}
              >
                <span aria-hidden="true" className={`absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-accent transition-opacity duration-150 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">{item.icon}</svg>
                {!isCollapsed && <span>{label}</span>}
                {!isCollapsed && count !== null && <span className="ml-auto text-[9px] font-mono text-ink-faint">{count}</span>}
              </button>
            )
          })}
        </nav>

        <div className="h-px bg-border my-4" />
        <ProjectGroup title={t('nav.runningNow')} projects={running} collapsed={isCollapsed} status="running" onProjectSelect={onProjectSelect} />
        <ProjectGroup title={t('nav.needsAttention')} projects={errors} collapsed={isCollapsed} status="error" onProjectSelect={onProjectSelect} />

        {prayer && prayerData && onPrayerExpand && (
          <div className="mt-auto pt-4">
            {isCollapsed
              ? <PrayerIcon data={prayerData} onExpand={onPrayerExpand} />
              : <PrayerCard data={prayerData} config={prayer} onExpand={onPrayerExpand} />}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        <button type="button" onClick={onAddProject} aria-label={t('nav.addProject')} className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2 text-xs font-semibold text-white shadow-glow hover:bg-accent-hover transition-colors">
          <span className="text-base leading-none">+</span>{!isCollapsed && t('nav.addProject')}
        </button>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            className="w-full text-[10px] text-ink-faint hover:text-ink transition-colors"
          >
            {isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          </button>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
