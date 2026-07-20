import React from 'react';

export default function TabNavigation({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'logs', label: 'Logs' },
    { id: 'env', label: 'Environment' },
    { id: 'settings', label: 'Settings' }
  ];

  return (
    <div className="flex items-center gap-1 border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange?.(tab.id)}
          className={`tab-btn px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === tab.id
              ? 'text-ink border-accent'
              : 'text-ink-faint border-transparent hover:text-ink'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
