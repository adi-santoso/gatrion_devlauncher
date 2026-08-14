// @ts-check
const net = require('net')

/**
 * Check whether a TCP port accepts connections on any loopback address.
 * @param {number} port
 * @param {number} [timeout]
 * @returns {Promise<boolean>}
 */
async function isPortOpen(port, timeout = 250) {
  const checkHost = (targetHost) => new Promise((resolve) => {
    const socket = net.createConnection({ port, host: targetHost })
    const finish = (open) => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })

  if (await checkHost('127.0.0.1')) return true
  if (await checkHost('localhost')) return true
  if (await checkHost('::1')) return true
  return false
}

module.exports = { isPortOpen }
