const assert = require('assert/strict')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const StorageManager = require('../../electron/managers/StorageManager')

function project(id) {
  return {
    id,
    name: `Project ${id}`,
    path: `C:/projects/${id}`,
    type: 'NODEJS',
    port: 3000,
    startCommand: 'npm start',
    envVars: [],
    emoji: '🟩',
    color: '#339933',
    autoStart: false,
    createdAt: new Date().toISOString(),
    lastRun: null,
  }
}

async function run() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devlauncher-storage-'))
  const storage = new StorageManager(tempDir)

  try {
    await storage.init()

    await Promise.all(
      Array.from({ length: 10 }, (_, index) => storage.updateProjects((projects) => ({
        projects: [...projects, project(String(index))],
      })))
    )

    const projects = await storage.loadProjects()
    assert.equal(projects.length, 10)
    assert.deepEqual(new Set(projects.map((item) => item.id)), new Set(Array.from({ length: 10 }, (_, index) => String(index))))

    await Promise.all([
      storage.updateConfig({ notifications: { sound: true } }),
      storage.updateConfig({ terminal: { maxLines: 2500 } }),
    ])
    const config = await storage.loadConfig()
    assert.equal(config.notifications.sound, true)
    assert.equal(config.terminal.maxLines, 2500)

    await storage.saveProjects([project('recoverable')])
    await storage.saveProjects([project('latest')])
    await fs.writeFile(storage.projectsFilePath, '{broken json', 'utf8')
    const recovered = await storage.loadProjects()
    assert.equal(recovered.length, 1)
    assert.equal(recovered[0].id, 'recoverable')
    assert.doesNotThrow(() => JSON.parse(require('fs').readFileSync(storage.projectsFilePath, 'utf8')))

    await fs.writeFile(storage.configFilePath, '{broken json', 'utf8')
    const recoveredConfig = await storage.loadConfig()
    assert.equal(recoveredConfig.notifications.sound, true)
    assert.equal(recoveredConfig.terminal.maxLines, 1000)

    await fs.writeFile(storage.projectsFilePath, '{}', 'utf8')
    const recoveredInvalidShape = await storage.loadProjects()
    assert.equal(recoveredInvalidShape.length, 1)
    assert.equal(recoveredInvalidShape[0].id, 'recoverable')

    const entries = await fs.readdir(tempDir)
    assert.equal(entries.some((entry) => entry.endsWith('.tmp')), false)

    console.log('StorageManager checks passed')
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
