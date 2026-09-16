import { useEffect, useRef, useState } from 'react';
import { useDetailI18n } from './useDetailI18n';
import { useI18n } from '../../i18n/I18nContext';

const baseTabs = [
  { id: 'app', label: 'App' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'git', label: 'Git' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'dependencies', label: 'Dependencies' },
  { id: 'environment', label: 'Environment' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Settings' }
];

export type ProjectTabId = typeof baseTabs[number]['id'] | 'logs';

interface TabNavigationProps {
  activeTab: string;
  onTabChange?: (tab: string) => void;
  /** When true the "Logs" tab (Laravel storage logs) is included. */
  showLogsTab?: boolean;
  projectId?: string;
}

export default function TabNavigation({ activeTab, onTabChange, showLogsTab = false, projectId }: TabNavigationProps) {
  const t = useDetailI18n();
  const { lang } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // Position the sliding underline under the active tab
  useEffect(() => {
    const update = () => {
      const element = listRef.current?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
      if (element) setIndicator({ left: element.offsetLeft, width: element.offsetWidth });
    };
    update();
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const observer = new ResizeObserver(update);
    if (listRef.current) observer.observe(listRef.current);
    return () => observer.disconnect();
  }, [activeTab, showLogsTab, lang]);

  const tabs = showLogsTab
    ? [
        ...baseTabs.slice(0, 1),
        { id: 'logs', label: 'Logs' },
        ...baseTabs.slice(1),
      ]
    : baseTabs;

  return (
    <div
      ref={listRef}
      className="relative flex items-center gap-1 border-b border-border overflow-x-auto min-w-0 max-w-full"
      role="tablist"
      aria-label={t('Project details')}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
           role="tab"
           id={`project-tab-${tab.id}`}
           aria-controls={`project-panel-${projectId}-${tab.id}`}
           tabIndex={activeTab === tab.id ? 0 : -1}
          data-tab={tab.id}
          aria-selected={activeTab === tab.id}
           onClick={() => onTabChange?.(tab.id)}
           onKeyDown={event => {
             const index = tabs.findIndex(item => item.id === tab.id);
             const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
             if (next < 0) return;
             event.preventDefault();
             onTabChange?.(tabs[next].id);
             listRef.current?.querySelector<HTMLElement>(`[data-tab="${tabs[next].id}"]`)?.focus();
           }}
           className={`shrink-0 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
            activeTab === tab.id ? 'text-ink' : 'text-ink-faint hover:text-ink'
          }`}
        >
          {t(tab.label)}
        </button>
      ))}
      <span
        aria-hidden="true"
        className="absolute bottom-0 h-0.5 rounded-full bg-accent transition-all duration-200 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  );
}
