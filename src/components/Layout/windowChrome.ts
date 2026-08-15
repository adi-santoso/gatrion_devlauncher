import type { CSSProperties } from 'react'

// `-webkit-app-region` is not part of csstype's Properties yet, so widen the
// style type where needed. Used by the frameless title bar: drag regions move
// the window (and double-click maximizes on Windows); interactive children
// must opt back in to mouse events with the no-drag region.
type WindowChromeStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }

const dragRegion: WindowChromeStyle = { WebkitAppRegion: 'drag' }
const noDragRegion: WindowChromeStyle = { WebkitAppRegion: 'no-drag' }

export { dragRegion, noDragRegion }
export type { WindowChromeStyle }
