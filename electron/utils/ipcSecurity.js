// @ts-check
const { app } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

const DEV_SERVER_URL = 'http://localhost:5173/'

function getPackagedIndexUrl() {
  return pathToFileURL(path.join(__dirname, '../../dist-react/index.html')).href
}

/**
 * Pure decision: is this sender URL trusted for the given environment?
 * Extracted from the electron glue so the security rules can be tested
 * without a running Electron runtime.
 * @param {string|null} senderUrl
 * @param {{ isPackaged: boolean, packagedUrl: string }} env
 */
function isTrustedSenderUrl(senderUrl, { isPackaged, packagedUrl }) {
  if (!senderUrl) return false
  if (!isPackaged) return senderUrl.startsWith(DEV_SERVER_URL)
  return senderUrl === packagedUrl
}

function isTrustedIpcEvent(event) {
  const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.()
  if (!senderUrl) return false
  return isTrustedSenderUrl(senderUrl, {
    isPackaged: app.isPackaged,
    packagedUrl: getPackagedIndexUrl(),
  })
}

function assertTrustedIpcEvent(event) {
  if (!isTrustedIpcEvent(event)) throw new Error('Unauthorized IPC sender')
}

module.exports = { assertTrustedIpcEvent, isTrustedIpcEvent, isTrustedSenderUrl, getPackagedIndexUrl }
