import type { IpcMainInvokeEvent } from 'electron'

const { app } = require('electron') as typeof import('electron')
const path = require('path')
const { pathToFileURL } = require('url')

const DEV_SERVER_URL = 'http://localhost:5173/'

function getPackagedIndexUrl(): string {
  return pathToFileURL(path.join(__dirname, '../../dist-react/index.html')).href
}

/**
 * Pure decision: is this sender URL trusted for the given environment?
 * Extracted from the electron glue so the security rules can be tested
 * without a running Electron runtime.
 */
function isTrustedSenderUrl(senderUrl: string | null | undefined, { isPackaged, packagedUrl }: { isPackaged: boolean; packagedUrl: string }): boolean {
  if (!senderUrl) return false
  if (!isPackaged) return senderUrl.startsWith(DEV_SERVER_URL)
  return senderUrl === packagedUrl
}

function isTrustedIpcEvent(event: IpcMainInvokeEvent): boolean {
  const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.()
  if (!senderUrl) return false
  return isTrustedSenderUrl(senderUrl, {
    isPackaged: app.isPackaged,
    packagedUrl: getPackagedIndexUrl(),
  })
}

function assertTrustedIpcEvent(event: IpcMainInvokeEvent): void {
  if (!isTrustedIpcEvent(event)) throw new Error('Unauthorized IPC sender')
}

export { assertTrustedIpcEvent, isTrustedIpcEvent, isTrustedSenderUrl, getPackagedIndexUrl }

