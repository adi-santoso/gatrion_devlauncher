import React from 'react';

/**
 * TrayIcon - Floating tray icon button (template demo only)
 * Lines 1080-1083 from template
 */
const TrayIcon = ({ onClick }) => {
  return (
    <button
      id="trayIconBtn"
      onClick={onClick}
      className="fixed bottom-4 left-4 z-40 w-11 h-11 rounded-full bg-surface border border-border shadow-card flex items-center justify-center hover:border-border-hover transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M5 3l14 9-14 9V3z" fill="#6D5EF5" />
      </svg>
      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-base"></span>
    </button>
  );
};

export default TrayIcon;
