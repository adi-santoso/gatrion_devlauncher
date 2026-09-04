/**
 * CDP device emulation for embedded preview views.
 *
 * The renderer already resizes the WebContentsView to the device's screen, so
 * `Emulation.setDeviceMetricsOverride` is applied at the *same* size (scale
 * 1:1) — what it really adds over a plain resize is `deviceScaleFactor`
 * (sharpness + DPR media queries), `mobile: true` (touch events, no hover,
 * tap targets) and the user-agent override (server-side rendering / UA
 * sniffing). This mirrors Chrome DevTools device mode.
 *
 * The debugger is the only way to reach these overrides in Electron. While it
 * is attached, DevTools cannot open on the same target — the renderer hides
 * the DevTools button for touch presets for that reason.
 */
import type { WebContents } from 'electron'

export interface DeviceEmulationParams {
  width: number
  height: number
  deviceScaleFactor: number
  mobile: boolean
  userAgent?: string
}

/** Clamp/sanitize an emulation config coming from the renderer. */
export function sanitizeEmulationConfig(config: Record<string, unknown> | null | undefined): DeviceEmulationParams | null {
  if (!config || typeof config !== 'object') return null
  const width = config.width
  const height = config.height
  const dpr = config.deviceScaleFactor
  const mobile = config.mobile
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('Invalid device dimensions')
  }
  if (width < 1 || width > 8192 || height < 1 || height > 8192) {
    throw new Error('Invalid device dimensions (1-8192)')
  }
  if (typeof dpr !== 'number' || !Number.isFinite(dpr) || dpr < 0.25 || dpr > 8) {
    throw new Error('Invalid device scale factor (0.25-8)')
  }
  const ua = config.userAgent
  if (ua !== undefined && (typeof ua !== 'string' || ua.length > 512)) {
    throw new Error('Invalid user agent')
  }
  return {
    width: Math.round(width),
    height: Math.round(height),
    deviceScaleFactor: dpr,
    mobile: mobile === true,
    ...(typeof ua === 'string' && ua.length > 0 ? { userAgent: ua } : {}),
  }
}

/** Attach the debugger and apply metrics + touch + UA overrides. */
export async function applyDeviceEmulation(contents: WebContents, config: DeviceEmulationParams): Promise<void> {
  const dbg = contents.debugger
  if (!dbg.isAttached()) dbg.attach('1.3')
  const { width, height } = config
  await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: config.deviceScaleFactor,
    mobile: config.mobile,
    // Required by Chromium when mobile: true — the emulated screen size.
    screenWidth: width,
    screenHeight: height,
  })
  await dbg.sendCommand('Emulation.setTouchEmulationEnabled', {
    enabled: config.mobile,
    maxTouchPoints: config.mobile ? 5 : 1,
  })
  if (config.userAgent) {
    await dbg.sendCommand('Network.setUserAgentOverride', { userAgent: config.userAgent })
  }
}

/** Clear every override and detach the debugger (no-op when not attached). */
export async function clearDeviceEmulation(contents: WebContents): Promise<void> {
  const dbg = contents.debugger
  if (!dbg.isAttached()) return
  try {
    await dbg.sendCommand('Emulation.clearDeviceMetricsOverride')
    await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false })
  } finally {
    dbg.detach()
  }
}