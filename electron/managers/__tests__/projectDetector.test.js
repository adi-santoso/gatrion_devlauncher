import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import ProjectDetector from '../ProjectDetector'

describe('ProjectDetector', () => {
  let tempDir
  let detector

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'detector-test-'))
    detector = new ProjectDetector()
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  const write = async (file, content) => {
    const target = path.join(tempDir, file)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content, 'utf8')
  }

  test('rejects missing or non-directory paths', async () => {
    expect((await detector.detectProjectType('')).success).toBe(false)
    expect((await detector.detectProjectType(path.join(tempDir, 'nope'))).success).toBe(false)
    await write('file.txt', 'x')
    expect((await detector.detectProjectType(path.join(tempDir, 'file.txt'))).success).toBe(false)
  })

  test('detects React (Vite) with port from vite.config and npm', async () => {
    await write('package.json', JSON.stringify({
      name: 'my-app',
      scripts: { dev: 'vite', build: 'vite build' },
      dependencies: { react: '^19', vite: '^6' },
    }))
    await write('vite.config.js', 'export default { server: { port: 4321 } }')
    const result = await detector.detectProjectType(tempDir)
    expect(result.success).toBe(true)
    expect(result.type).toBe('REACT_VITE')
    expect(result.defaultCommand).toBe('npm run dev')
    expect(result.defaultPort).toBe(4321)
    expect(result.projectName).toBe('my-app')
    expect(result.packageManager).toBe('npm')
  })

  test('detects Next.js and Vue', async () => {
    await write('next-app/package.json', JSON.stringify({ scripts: { dev: 'next dev' }, dependencies: { next: '^15', react: '^19' } }))
    const next = await detector.detectProjectType(path.join(tempDir, 'next-app'))
    expect(next.type).toBe('NEXTJS')

    await write('vue-app/package.json', JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { vue: '^3', vite: '^6' } }))
    const vue = await detector.detectProjectType(path.join(tempDir, 'vue-app'))
    expect(vue.type).toBe('VUE')
  })

  test('detects Laravel and Laravel + Inertia Vue composite commands', async () => {
    await write('laravel/artisan', '<?php //')
    await write('laravel/composer.json', JSON.stringify({ require: { 'laravel/framework': '^11' } }))
    const laravel = await detector.detectProjectType(path.join(tempDir, 'laravel'))
    expect(laravel.type).toBe('LARAVEL')
    expect(laravel.defaultCommand).toBe('php artisan serve')
    expect(laravel.defaultPort).toBe(8000)
    expect(laravel.commands).toHaveLength(1)

    await write('inertia/composer.json', JSON.stringify({ require: { 'laravel/framework': '^11' } }))
    await write('inertia/artisan', '<?php //')
    await write('inertia/package.json', JSON.stringify({
      scripts: { dev: 'vite' },
      dependencies: { '@inertiajs/vue3': '^2', vue: '^3', vite: '^6' },
    }))
    const inertia = await detector.detectProjectType(path.join(tempDir, 'inertia'))
    expect(inertia.type).toBe('LARAVEL')
    expect(inertia.name).toBe('Laravel + Inertia + Vue')
    expect(inertia.commands.length).toBe(2)
    expect(inertia.commands[1].name).toContain('Inertia Vue assets')
  })

  test('Laravel 11/12 composer.json with scripts.dev yields single composer run dev command', async () => {
    await write('laravel11/artisan', '<?php //')
    await write('laravel11/composer.json', JSON.stringify({
      require: { 'laravel/framework': '^11.31' },
      scripts: {
        dev: [
          'Composer\\Config::disableProcessTimeout',
          'npx concurrently -c "#93c5fd,#c4b5fd,#fb7185,#fdba74" "php artisan serve" "php artisan queue:listen --tries=1" "php artisan pail --timeout=0" "npm run dev" --names=server,queue,logs,vite',
        ],
      },
    }))
    await write('laravel11/package.json', JSON.stringify({
      scripts: { dev: 'vite' },
      dependencies: { '@inertiajs/vue3': '^2', vue: '^3', vite: '^6' },
    }))
    const result = await detector.detectProjectType(path.join(tempDir, 'laravel11'))
    expect(result.type).toBe('LARAVEL')
    expect(result.defaultCommand).toBe('composer run dev')
    expect(result.commands).toHaveLength(1)
    expect(result.commands[0].command).toBe('composer run dev')
    expect(result.commands[0].primary).toBe(true)
    expect(result.defaultPort).toBe(8000)
  })

  test('Laravel 13 composer.json with @php artisan dev script yields single composer run dev command', async () => {
    await write('laravel13/artisan', '<?php //')
    await write('laravel13/composer.json', JSON.stringify({
      require: { 'laravel/framework': '^13.17' },
      scripts: {
        dev: [
          'Composer\\Config::disableProcessTimeout',
          '@php artisan dev',
        ],
      },
    }))
    await write('laravel13/package.json', JSON.stringify({
      scripts: { dev: 'vite' },
      dependencies: { '@inertiajs/vue3': '^2', vue: '^3', vite: '^6' },
    }))
    const result = await detector.detectProjectType(path.join(tempDir, 'laravel13'))
    expect(result.type).toBe('LARAVEL')
    expect(result.defaultCommand).toBe('composer run dev')
    expect(result.commands).toHaveLength(1)
    expect(result.commands[0].command).toBe('composer run dev')
  })

  test('Laravel 10 without composer scripts.dev falls back to php artisan serve + npm run dev', async () => {
    await write('laravel10/artisan', '<?php //')
    await write('laravel10/composer.json', JSON.stringify({
      require: { 'laravel/framework': '^10.10' },
      scripts: {
        'post-autoload-dump': [
          'Illuminate\\Foundation\\ComposerScripts::postAutoloadDump',
          '@php artisan package:discover --ansi',
        ],
      },
    }))
    await write('laravel10/package.json', JSON.stringify({
      scripts: { dev: 'vite' },
      dependencies: { '@inertiajs/vue3': '^2', vue: '^3', vite: '^6' },
    }))
    const result = await detector.detectProjectType(path.join(tempDir, 'laravel10'))
    expect(result.type).toBe('LARAVEL')
    expect(result.defaultCommand).toBe('php artisan serve')
    expect(result.commands).toHaveLength(2)
    expect(result.commands[0].command).toBe('php artisan serve')
    expect(result.commands[1].command).toBe('npm run dev')
  })

  test('Laravel reads APP_PORT from .env for defaultPort', async () => {
    await write('laravel-port/artisan', '<?php //')
    await write('laravel-port/composer.json', JSON.stringify({
      require: { 'laravel/framework': '^13.17' },
      scripts: { dev: '@php artisan dev' },
    }))
    await write('laravel-port/.env', 'APP_NAME=MyApp\nAPP_PORT=8181\n')
    const result = await detector.detectProjectType(path.join(tempDir, 'laravel-port'))
    expect(result.type).toBe('LARAVEL')
    expect(result.defaultPort).toBe(8181)
    expect(result.commands[0].port).toBe(8181)
  })

  test('detects Go via go.mod and main.go', async () => {
    await write('go-app/go.mod', 'module github.com/me/api\n\ngo 1.22\n')
    const goMod = await detector.detectProjectType(path.join(tempDir, 'go-app'))
    expect(goMod.type).toBe('GOLANG')
    expect(goMod.defaultCommand).toBe('go run .')
    expect(goMod.projectName).toBe('api')

    await write('go-main/main.go', 'package main\n')
    const goMain = await detector.detectProjectType(path.join(tempDir, 'go-main'))
    expect(goMain.type).toBe('GOLANG')
  })

  test('detects plain Node and respects package manager lockfiles', async () => {
    await write('node-app/package.json', JSON.stringify({ name: 'plain-node', scripts: { start: 'node index.js' } }))
    await write('node-app/pnpm-lock.yaml', 'lockfileVersion: 9\n')
    const node = await detector.detectProjectType(path.join(tempDir, 'node-app'))
    expect(node.type).toBe('NODEJS')
    expect(node.defaultCommand).toBe('pnpm start')
    expect(node.packageManager).toBe('pnpm')
    expect(node.projectName).toBe('plain-node')
  })

  test('falls back to CUSTOM with a warning when nothing is detected', async () => {
    await write('mystery/readme.md', '# no package managers here')
    const result = await detector.detectProjectType(path.join(tempDir, 'mystery'))
    expect(result.success).toBe(true)
    expect(result.type).toBe('CUSTOM')
    expect(result.defaultCommand).toBe('')
    expect(result.projectName).toBe('mystery')
    expect(result.warnings.some((w) => /start command/i.test(w))).toBe(true)
  })

  test('reads PORT from .env files when present', async () => {
    await write('env-app/package.json', JSON.stringify({ name: 'env-app', scripts: { dev: 'node server.js' } }))
    await write('env-app/.env', 'PORT=5555\n')
    const result = await detector.detectProjectType(path.join(tempDir, 'env-app'))
    expect(result.type).toBe('NODEJS')
    expect(result.defaultPort).toBe(5555)
  })

  test('invalid port values fall back to the type default', async () => {
    await write('badport-app/package.json', JSON.stringify({ name: 'bad', scripts: { start: 'node x.js' } }))
    await write('badport-app/.env', 'PORT=not-a-number\n')
    const result = await detector.detectProjectType(path.join(tempDir, 'badport-app'))
    expect(result.defaultPort).toBe(3000)
  })

  test('missing package.json yields custom type with folder name', async () => {
    await write('bare-dir/go.txt', 'hello')
    const result = await detector.detectProjectType(path.join(tempDir, 'bare-dir'))
    expect(result.success).toBe(true)
    expect(result.type).toBe('CUSTOM')
    expect(result.projectName).toBe('bare-dir')
  })
})
