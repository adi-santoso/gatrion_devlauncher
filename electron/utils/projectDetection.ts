const fs = require('fs').promises
const path = require('path')
import { localPython } from './projectMetadata'
import { shellQuote } from './shellQuote'

/**
 * Shared detect-time helpers for ProjectDetector. Kept here so ProjectDetector
 * stays focused on the framework table + orchestration and remains under the
 * lint line cap.
 */

function validPort(value: string | null | undefined): number | null {
  const port = Number.parseInt(value || '', 10)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

// Laravel 11+ ships a `scripts.dev` entry in composer.json. When present we
// surface `composer run dev` as a single composite command, matching the official
// recommendation. For Laravel 10 (no composer dev script) it returns null.
function detectComposerDevScript(composerJson: Record<string, unknown> | null | undefined): string | null {
  if (!composerJson || typeof composerJson !== 'object') return null
  const scripts = (composerJson.scripts as Record<string, unknown> | undefined) || {}
  const flatten = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) return value.map((entry) => flatten(entry)).join(' ')
    return ''
  }
  return flatten(scripts.dev).trim() ? 'composer run dev' : null
}

async function detectAppPortFromEnv(projectPath: string): Promise<number | null> {
  for (const envFile of ['.env.development.local', '.env.local', '.env.development', '.env']) {
    try {
      const content = await fs.readFile(path.join(projectPath, envFile), 'utf8')
      const port = validPort(content.match(/^APP_PORT\s*=\s*["']?(\d+)["']?/m)?.[1])
      if (port) return port
    } catch {
      // Missing and unreadable optional files are ignored.
    }
  }
  return null
}

// Only Django's explicit runserver command has a conventional listening port.
async function detectPythonConfig(projectPath: string): Promise<{ command: string; port: number | null }> {
  const python = localPython(projectPath)
  const runner = python ? shellQuote(python) : 'python'
  const probes: Array<[string, string, number | null]> = [
    ['manage.py', `${runner} manage.py runserver`, 8000],
    ['app.py', `${runner} app.py`, null],
    ['main.py', `${runner} main.py`, null],
  ]
  for (const [file, command, port] of probes) {
    if (await fileExists(path.join(projectPath, file))) return { command, port }
  }
  return { command: '', port: null }
}

export async function detectLaunchPort(projectPath: string, script: string, fallback: number | null, frontendOnly = false): Promise<{ port: number | null; source: string }> {
  const explicit = validPort(script.match(/(?:^|\s)(?:--port(?:=|\s+)|-p\s+)(\d+)\b/)?.[1])
    || validPort(script.match(/(?:^|\s)(?:PORT|VITE_PORT)=(\d+)\b/)?.[1])
  if (explicit) return { port: explicit, source: 'package.json → selected script' }
  // Static server.port only: never mistake preview.port for the dev server.
  if (/\bvite\b/.test(script)) for (const file of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts']) {
    try {
      const content = (await fs.readFile(path.join(projectPath, file), 'utf8')).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')
      const port = validPort(content.match(/\bserver\s*:\s*\{[^{}]*?\bport\s*:\s*(\d+)/)?.[1])
      if (port) return { port, source: `${file} → server.port` }
    } catch { /* optional static configuration */ }
  }
  for (const file of ['.env.development.local', '.env.local', '.env.development', '.env']) {
    try {
      const content = await fs.readFile(path.join(projectPath, file), 'utf8')
      const pattern = frontendOnly ? /^VITE_PORT\s*=\s*["']?(\d+)["']?\s*$/m : /^(?:PORT|VITE_PORT|APP_PORT|SERVER_PORT|DEV_PORT)\s*=\s*["']?(\d+)["']?\s*$/m
      const port = validPort(content.match(pattern)?.[1])
      if (port) return { port, source: `${file} (verify the command reads this value)` }
    } catch { /* optional environment file */ }
  }
  return { port: fallback, source: fallback ? 'Framework convention (verify)' : 'No port monitoring' }
}

export { detectComposerDevScript, detectAppPortFromEnv, detectPythonConfig }
