import React, { useEffect, useRef, useState } from 'react';

const tabs = [
  { id: 'app', label: 'App' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'git', label: 'Git' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'environment', label: 'Environment' },
  { id: 'settings', label: 'Settings' }
];

export default function TabNavigation({ activeTab, onTabChange }) {
  const listRef = useRef(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // Position the sliding underline under the active tab
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-tab="${activeTab}"]`);
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeTab]);

  return (
    <div
      ref={listRef}
      className="relative flex items-center gap-1 border-b border-border"
      role="tablist"
      aria-label="Project details"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-tab={tab.id}
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange?.(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === tab.id ? 'text-ink' : 'text-ink-faint hover:text-ink'
          }`}
        >
          {tab.label}
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
