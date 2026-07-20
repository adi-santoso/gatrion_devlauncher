import React from 'react';

const TitleBar = ({ version }) => {
  return (
    <div
      className="h-9 flex items-center justify-between px-3 bg-base border-b border-border select-none"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
          <span className="w-3 h-3 rounded-full bg-[#2A2F38] hover:bg-danger transition-colors cursor-pointer"></span>
          <span className="w-3 h-3 rounded-full bg-[#2A2F38] hover:bg-warning transition-colors cursor-pointer"></span>
          <span className="w-3 h-3 rounded-full bg-[#2A2F38] hover:bg-success transition-colors cursor-pointer"></span>
        </div>
      </div>
      <p className="text-xs font-mono text-ink-faint tracking-wide">DevLauncher — {version}</p>
      <div className="w-14" style={{ WebkitAppRegion: 'no-drag' }}></div>
    </div>
  );
};

export default TitleBar;
