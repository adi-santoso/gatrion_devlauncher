const assert = require('assert')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const ProjectDetector = require('./electron/managers/ProjectDetector')

async function writeJson(directory, name, value) {
  await fs.writeFile(path.join(directory, name), JSON.stringify(value), 'utf8')
}

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gatrion-detector-'))
  const detector = new ProjectDetector()

  try {
    const reactPath = path.join(root, 'react-folder')
    await fs.mkdir(reactPath)
    await writeJson(reactPath, 'package.json', {
      name: '@gatrion/storefront',
      packageManager: 'pnpm@9.0.0',
      scripts: { dev: 'vite --port 4100' },
      dependencies: { react: '^19.0.0' },
      devDependencies: { vite: '^8.0.0' },
    })
    const react = await detector.detectProjectType(reactPath)
    assert.strictEqual(react.type, 'REACT_VITE')
    assert.strictEqual(react.projectName, 'storefront')
    assert.strictEqual(react.packageManager, 'pnpm')
    assert.strictEqual(react.defaultCommand, 'pnpm dev')
    assert.strictEqual(react.defaultPort, 4100)

    const nextPath = path.join(root, 'next-app')
    await fs.mkdir(nextPath)
    await writeJson(nextPath, 'package.json', {
      name: '@gatrion/web',
      scripts: { dev: 'next dev' },
      dependencies: { next: '14.0.0', react: '^18.0.0' },
    })
    const next = await detector.detectProjectType(nextPath)
    assert.strictEqual(next.type, 'NEXTJS')
    assert.strictEqual(next.name, 'Next.js')
    assert.strictEqual(next.defaultCommand, 'npm run dev')
    assert.strictEqual(next.defaultPort, 3000)

    // Create React App (react-scripts, no Vite) must be React, not a generic Node.js app
    const reactCraPath = path.join(root, 'cra-app')
    await fs.mkdir(reactCraPath)
    await writeJson(reactCraPath, 'package.json', {
      name: 'legacy-app',
      scripts: { start: 'react-scripts start' },
      dependencies: { react: '^18.0.0', 'react-scripts': '5.0.0' },
    })
    const cra = await detector.detectProjectType(reactCraPath)
    assert.strictEqual(cra.type, 'REACT')
    assert.strictEqual(cra.name, 'React')
    assert.strictEqual(cra.defaultCommand, 'npm start')
    assert.strictEqual(cra.defaultPort, 3000)

    const vuePath = path.join(root, 'vue-app')
    await fs.mkdir(vuePath)
    await writeJson(vuePath, 'package.json', {
      scripts: { serve: 'vite' },
      dependencies: { vue: '^3.0.0' },
      devDependencies: { vite: '^8.0.0' },
    })
    await fs.writeFile(path.join(vuePath, 'yarn.lock'), '', 'utf8')
    const vue = await detector.detectProjectType(vuePath)
    assert.strictEqual(vue.type, 'VUE')
    assert.strictEqual(vue.packageManager, 'yarn')
    assert.strictEqual(vue.defaultCommand, 'yarn serve')

    const laravelPath = path.join(root, 'laravel-app')
    await fs.mkdir(laravelPath)
    await fs.writeFile(path.join(laravelPath, 'artisan'), '', 'utf8')
    await writeJson(laravelPath, 'composer.json', {
      name: 'gatrion/backend',
      require: { 'laravel/framework': '^12.0' },
    })
    await writeJson(laravelPath, 'package.json', {
      scripts: { dev: 'vite' },
      dependencies: { vue: '^3.0.0', '@inertiajs/vue3': '^2.0.0' },
      devDependencies: { vite: '^8.0.0' },
    })
    await fs.writeFile(path.join(laravelPath, 'vite.config.js'), 'export default { server: { port: 5199 } }', 'utf8')
    const laravel = await detector.detectProjectType(laravelPath)
    assert.strictEqual(laravel.type, 'LARAVEL')
    assert.strictEqual(laravel.name, 'Laravel + Inertia + Vue')
    assert.strictEqual(laravel.projectName, 'backend')
    assert.strictEqual(laravel.defaultCommand, 'php artisan serve')
    assert.deepStrictEqual(laravel.commands, [
      { id: 'app', name: 'Laravel', command: 'php artisan serve', port: 8000, primary: true },
      { id: 'assets', name: 'Inertia Vue assets', command: 'npm run dev', port: 5199, primary: false },
    ])

    const goPath = path.join(root, 'go-folder')
    await fs.mkdir(goPath)
    await fs.writeFile(path.join(goPath, 'go.mod'), 'module github.com/gatrion/api\n', 'utf8')
    const go = await detector.detectProjectType(goPath)
    assert.strictEqual(go.type, 'GOLANG')
    assert.strictEqual(go.projectName, 'api')
    assert.strictEqual(go.defaultPort, null)

    const customPath = path.join(root, 'custom-tool')
    await fs.mkdir(customPath)
    const custom = await detector.detectProjectType(customPath)
    assert.strictEqual(custom.type, 'CUSTOM')
    assert.strictEqual(custom.projectName, 'custom-tool')
    assert.strictEqual(custom.defaultCommand, '')
    assert.ok(custom.warnings.length > 0)

    const nodePath = path.join(root, 'node-without-start-script')
    await fs.mkdir(nodePath)
    await writeJson(nodePath, 'package.json', { name: 'worker', scripts: { test: 'node test.js' } })
    const node = await detector.detectProjectType(nodePath)
    assert.strictEqual(node.type, 'NODEJS')
    assert.strictEqual(node.defaultCommand, '')
    assert.match(node.warnings[0], /Start command/)

    const invalid = await detector.detectProjectType(path.join(root, 'missing'))
    assert.strictEqual(invalid.success, false)
    assert.match(invalid.error, /does not exist/)

    console.log('Project detector tests passed')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
