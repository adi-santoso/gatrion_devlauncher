import React from 'react';

const tabs = [
  { id: 'app', label: 'App' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'environment', label: 'Environment' },
  { id: 'settings', label: 'Settings' }
];

export default function TabNavigation({ activeTab, onTabChange }) {
  return (
    <div className="flex items-center gap-1 border-b border-border" role="tablist" aria-label="Project details">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
          onClick={() => onTabChange?.(tab.id)}
          className={`tab-btn px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab.id ? 'text-ink border-accent' : 'text-ink-faint border-transparent hover:text-ink'}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
