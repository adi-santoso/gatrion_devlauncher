import type { ReactNode } from 'react';

const Svg = ({ children, size = 15 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0 text-ink-faint"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Icons: Record<string, ReactNode> = {
  plus: <Svg><path d="M12 5v14M5 12h14" /></Svg>,
  grid: <Svg><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></Svg>,
  folder: <Svg><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></Svg>,
  gear: <Svg><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 01-.1 1l2 1.5-2 3.5-2.5-1A7 7 0 0115 18l-.4 3h-4l-.4-3a7 7 0 01-1.6-1L6 18l-2-3.5L6 13a7 7 0 010-2L4 9.5 6 6l2.6 1A7 7 0 0110 6l.4-3h4l.4 3a7 7 0 011.6 1L19 6l2 3.5-2 1.5a7 7 0 010 1z" /></Svg>,
  moon: <Svg><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></Svg>,
  keyboard: <Svg><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 13h10" /></Svg>,
  play: <Svg><path d="M7 4.9v14.2c0 .9.95 1.4 1.7.9l11-7.1c.7-.45.7-1.45 0-1.9l-11-7.1c-.75-.5-1.7 0-1.7.9z" /></Svg>,
  stop: <Svg><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>,
  layers: <Svg><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></Svg>,
  search: <Svg size={14}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></Svg>,
  message: <Svg><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></Svg>,
  file: <Svg><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></Svg>,
};

export interface ActionDef {
  id: string;
  name?: string;
  label?: string;
  icon?: ReactNode;
  [key: string]: unknown;
}

export const ACTIONS: ActionDef[] = [
  { id: 'new-project', name: 'Add New Project', icon: Icons.plus },
  { id: 'view-dashboard', name: 'Go to Dashboard', icon: Icons.grid },
  { id: 'view-projects', name: 'Go to Projects Registry', icon: Icons.folder },
  { id: 'view-settings', name: 'Go to Settings', icon: Icons.gear },
  { id: 'toggle-theme', name: 'Toggle Dark/Light Theme', icon: Icons.moon },
  { id: 'shortcuts', name: 'Keyboard Shortcuts', icon: Icons.keyboard },
  { id: 'start-all', name: 'Start All Projects', icon: Icons.play },
  { id: 'stop-all', name: 'Stop All Projects', icon: Icons.stop },
];
