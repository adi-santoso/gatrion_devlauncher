const assert = require('assert/strict')
const {
  envVarsToObject,
  normalizeProject,
  sanitizeProjectChanges,
  validateProject,
} = require('./electron/projectSchema')
const { applyConfigUpdates, normalizeConfig } = require('./electron/configSchema')

const migrated = validateProject(normalizeProject({
  id: 'legacy-id',
  name: ' Legacy App ',
  path: ' C:/projects/legacy ',
  type: '⚛️ React (Vite)',
  port: '5173',
  command: ' npm run dev ',
  env: { NODE_ENV: 'development', PORT: 5173 },
  icon: '⚛️',
  color: '#61DAFB',
}))

assert.equal(migrated.type, 'REACT_VITE')
assert.equal(migrated.port, 5173)
assert.equal(migrated.startCommand, 'npm run dev')
assert.deepEqual(migrated.envVars, [
  { key: 'NODE_ENV', value: 'development' },
  { key: 'PORT', value: '5173' },
])
assert.deepEqual(envVarsToObject(migrated.envVars), { NODE_ENV: 'development', PORT: '5173' })

const migratedWithoutPort = validateProject(normalizeProject({
  ...migrated,
  port: null,
}))
assert.equal(migratedWithoutPort.port, null)
assert.equal(normalizeProject({ ...migrated, port: '' }).port, null)
assert.deepEqual(sanitizeProjectChanges({ port: null }), { port: null })
assert.deepEqual(migrated.commands, [
  { id: 'main', name: 'Application', command: 'npm run dev', port: 5173, primary: true },
])

const composite = validateProject(normalizeProject({
  ...migrated,
  commands: [
    { id: 'app', name: 'Laravel', command: 'php artisan serve', port: 8000, primary: true },
    { id: 'assets', name: 'Frontend assets', command: 'npm run dev', port: 5173, primary: false },
  ],
  startCommand: 'php artisan serve',
  port: 8000,
}))
assert.equal(composite.commands.length, 2)
assert.equal(composite.startCommand, 'php artisan serve')
assert.throws(() => validateProject({ ...composite, commands: composite.commands.map((item) => ({ ...item, primary: true })) }), /exactly one primary/)
assert.throws(() => sanitizeProjectChanges({ commands: [{ id: 'app', name: 'App', command: 'npm start', pid: 1 }] }), /Unsupported project command field: pid/)

assert.throws(() => sanitizeProjectChanges({ id: 'changed' }), /Unsupported project field: id/)
assert.throws(() => sanitizeProjectChanges({ type: 'React (Vite)' }), /Project type is invalid/)
assert.throws(() => sanitizeProjectChanges({ port: '5173' }), /Port must be an integer/)
assert.throws(() => validateProject({ ...migrated, port: 70000 }), /Port must be an integer/)
assert.throws(
  () => validateProject({ ...migrated, envVars: [{ key: 'BAD KEY', value: '' }] }),
  /Invalid environment variable name/
)

const migratedConfig = normalizeConfig({
  theme: 'light',
  notifyOnStart: false,
  notifyOnCrash: true,
  notificationSound: true,
  terminalFontSize: 16,
  terminalMaxLines: 2000,
  terminalAutoScroll: false,
})

assert.deepEqual(migratedConfig.notifications, { onStart: false, onError: true, sound: true })
assert.deepEqual(migratedConfig.terminal, { fontSize: 16, maxLines: 2000, autoScroll: false })
assert.deepEqual(migratedConfig.preview, { keepAlive: true })

const updatedConfig = applyConfigUpdates(migratedConfig, { notifications: { sound: false } })
assert.equal(updatedConfig.notifications.onStart, false)
assert.equal(updatedConfig.notifications.sound, false)
assert.equal(applyConfigUpdates(migratedConfig, { preview: { keepAlive: false } }).preview.keepAlive, false)
assert.throws(() => applyConfigUpdates(migratedConfig, { unknown: true }), /Unsupported config field/)
assert.throws(() => applyConfigUpdates(migratedConfig, { startOnBoot: 'yes' }), /must be a boolean/)
assert.throws(() => applyConfigUpdates(migratedConfig, { preview: { keepAlive: 'yes' } }), /preview.keepAlive must be a boolean/)
assert.throws(() => applyConfigUpdates(migratedConfig, { preview: { bogus: true } }), /Unsupported preview field/)

console.log('Schema checks passed')
