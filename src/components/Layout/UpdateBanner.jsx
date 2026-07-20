import React from 'react';

const UpdateBanner = ({ version, onRestart, onDismiss }) => {
  return (
    <div className="bg-accent/15 border-b border-accent/30 text-accent text-xs px-4 py-2 flex items-center justify-center gap-2.5">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 2v13M6 9l6 6 6-6" />
        <path d="M5 19h14" />
      </svg>
      <span>DevLauncher {version} is available.</span>
      <button onClick={onRestart} className="underline font-semibold">
        Restart to update
      </button>
      <button onClick={onDismiss} className="ml-2 text-accent/70 hover:text-accent">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default UpdateBanner;
