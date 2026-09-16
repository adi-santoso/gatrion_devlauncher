import fs from 'fs'
import path from 'path'

export const LOCKFILES = [
  { file: 'pnpm-lock.yaml', pm: 'pnpm' }, { file: 'yarn.lock', pm: 'yarn' },
  { file: 'bun.lock', pm: 'bun' }, { file: 'bun.lockb', pm: 'bun' },
  { file: 'package-lock.json', pm: 'npm' }, { file: 'npm-shrinkwrap.json', pm: 'npm' },
]
export function readManifest(file: string): Record<string, unknown> | null {
  let raw: string
  try { raw = fs.readFileSync(file, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error(`Cannot read manifest: ${path.basename(file)}`)
  }
  try {
    const value = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required')
    return value
  } catch { throw new Error(`Invalid JSON manifest: ${path.basename(file)}`) }
}
export function resolvePackageManager(cwd: string, pkg = readManifest(path.join(cwd, 'package.json'))) {
  const declared = typeof pkg?.packageManager === 'string' ? pkg.packageManager.split('@')[0].trim().toLowerCase() : ''
  if (declared && !['npm', 'pnpm', 'yarn', 'bun'].includes(declared)) throw new Error(`Unsupported package manager: ${declared}`)
  const locks = LOCKFILES.filter(lock => fs.existsSync(path.join(cwd, lock.file)))
  return { manager: declared || locks[0]?.pm || 'npm', source: declared ? 'package.json → packageManager' : locks[0]?.file || 'npm (default)', warnings: new Set(locks.map(lock => lock.pm)).size > 1 ? ['Multiple package-manager lockfiles found. Remove obsolete lockfiles or declare packageManager in package.json.'] : [] }
}
export function localPython(cwd: string): string | null {
  for (const folder of ['.venv', 'venv', 'env']) {
    const executable = path.join(cwd, folder, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    if (fs.existsSync(executable)) return executable
  }
  return null
}
