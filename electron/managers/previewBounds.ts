import type { BrowserWindow, View, WebContentsView } from 'electron';
const { View: NativeView } = require('electron') as typeof import('electron');

export interface PreviewBounds {
  x: number; y: number; width: number; height: number;
  clip?: { x: number; y: number; width: number; height: number };
}

/** Crop the native surface without changing the web page's viewport dimensions. */
export function placePreview(win: BrowserWindow | null, entry: { view: WebContentsView; clipView?: View }, bounds: PreviewBounds) {
  const { x, y, width, height } = bounds;
  if (![x, y, width, height].every(Number.isFinite)) return;
  const next = { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  if (bounds.clip && Object.values(bounds.clip).every(Number.isFinite)) {
    if (!entry.clipView) {
      entry.clipView = new NativeView();
      win?.contentView.removeChildView(entry.view);
      win?.contentView.addChildView(entry.clipView);
      entry.clipView.addChildView(entry.view);
    }
    const clip = bounds.clip;
    entry.clipView.setBounds({ x: Math.round(clip.x), y: Math.round(clip.y), width: Math.max(1, Math.round(clip.width)), height: Math.max(1, Math.round(clip.height)) });
    next.x -= Math.round(clip.x);
    next.y -= Math.round(clip.y);
  } else if (entry.clipView) {
    entry.clipView.removeChildView(entry.view);
    win?.contentView.removeChildView(entry.clipView);
    win?.contentView.addChildView(entry.view);
    entry.clipView = undefined;
  }
  const previous = entry.view.getBounds?.();
  entry.view.setBounds(next);
  // Growing native views on Windows can expose a stale/black compositor surface.
  if (!previous || previous.width !== next.width || previous.height !== next.height) entry.view.webContents.invalidate?.();
}
