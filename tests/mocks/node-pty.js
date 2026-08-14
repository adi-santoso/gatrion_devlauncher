// Fake node-pty for vitest (aliased in vitest.config.js). node-pty loads fine
// in plain Node and would spawn a real shell during tests; this mock replaces
// it with an inert terminal object so terminal handler flows are deterministic.

function createFakeTerminal() {
  const term = {
    _dataListeners: [],
    _exitListeners: [],
    write: () => {},
    resize: () => {},
    kill: () => {},
    onData(fn) {
      this._dataListeners.push(fn)
    },
    onExit(fn) {
      this._exitListeners.push(fn)
    },
    _emitData(chunk) {
      this._dataListeners.forEach((fn) => fn(chunk))
    },
    _emitExit(exitCode) {
      this._exitListeners.forEach((fn) => fn({ exitCode }))
    },
  }
  return term
}

module.exports = {
  spawn: () => createFakeTerminal(),
}
