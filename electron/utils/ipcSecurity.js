const { app } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

function isTrustedIpcEvent(event) {
  const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.()
  if (!senderUrl) return false
  if (!app.isPackaged) return senderUrl.startsWith('http://localhost:5173/')
  return senderUrl === pathToFileURL(path.join(__dirname, '../../dist-react/index.html')).href
}

function assertTrustedIpcEvent(event) {
  if (!isTrustedIpcEvent(event)) throw new Error('Unauthorized IPC sender')
}

module.exports = { assertTrustedIpcEvent, isTrustedIpcEvent }
