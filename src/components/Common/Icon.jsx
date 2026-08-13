import React from 'react';

/**
 * Shared feather-style icon set (stroke 2px, currentColor) so action buttons
 * across the UI render consistently instead of mixing emoji.
 *
 * Usage: <Icon name="play" size={14} />
 */
const PATHS = {
  play: <path d="M7 4.9v14.2c0 .9.95 1.4 1.7.9l11-7.1c.7-.45.7-1.45 0-1.9l-11-7.1c-.75-.5-1.7 0-1.7.9z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  restart: <><path d="M21 12a9 9 0 11-2.64-6.36" /><path d="M21 3v6h-6" /></>,
  bolt: <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />,
  spinner: <path d="M21 12a9 9 0 11-6.219-8.56" />,
  more: <><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
  code: <><path d="M8 6l-6 6 6 6" /><path d="M16 6l6 6-6 6" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 01-.1 1l2 1.5-2 3.5-2.5-1A7 7 0 0115 18l-.4 3h-4l-.4-3a7 7 0 01-1.6-1L6 18l-2-3.5L6 13a7 7 0 010-2L4 9.5 6 6l2.6 1A7 7 0 0110 6l.4-3h4l.4 3a7 7 0 011.6 1L19 6l2 3.5-2 1.5a7 7 0 010 1z" /></>,
  duplicate: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /></>,
  external: <><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></>,
  chevronLeft: <path d="M15 18l-6-6 6-6" />,
  chevronRight: <path d="M9 18l6-6-6-6" />,
  terminal: <><path d="M4 17l6-6-6-6" /><path d="M12 19h8" /></>,
  trashX: <><path d="M3 6h18" /><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /><path d="M9.5 11l5 5M14.5 11l-5 5" /></>,
  warn: <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></>,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  maximize: <><path d="M8 3H5a2 2 0 00-2 2v3" /><path d="M21 8V5a2 2 0 00-2-2h-3" /><path d="M3 16v3a2 2 0 002 2h3" /><path d="M16 21h3a2 2 0 002-2v-3" /></>,
  minimize: <><path d="M8 3v3a2 2 0 01-2 2H3" /><path d="M21 8h-3a2 2 0 01-2-2V3" /><path d="M3 16h3a2 2 0 012 2v3" /><path d="M16 21v-3a2 2 0 012-2h3" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  arrowDown: <><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></>,
  gitBranch: <><path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 01-9 9" /></>,
  commit: <><circle cx="12" cy="12" r="4" /><path d="M1.05 12H7" /><path d="M17.01 12h5.95" /></>,
  download: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>,
  upload: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 8l5-5 5 5" /><path d="M12 3v12" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fileText: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></>,
};

export default function Icon({ name, size = 14, className = '', strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
