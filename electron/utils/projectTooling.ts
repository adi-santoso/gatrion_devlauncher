import { existsSync } from 'fs';
import { copyFile } from 'fs/promises';
import path from 'path';
import { execTool } from './packageRunner';
import { execNpm } from './npmRunner';
import { LOCKFILES, resolvePackageManager, localPython } from './projectMetadata';
export { LOCKFILES } from './projectMetadata';

export function packageManager(cwd: string): string {
  return resolvePackageManager(cwd).manager;
}
export async function backupFiles(cwd: string, files: string[]): Promise<string[]> {
  const backups: string[] = [];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  for (const file of files) {
    if (!existsSync(path.join(cwd, file))) continue;
    const name = `${file}.backup-${stamp}`;
    await copyFile(path.join(cwd, file), path.join(cwd, name));
    backups.push(name);
  }
  return backups;
}
export function pythonTool(cwd: string): string {
  const python = localPython(cwd);
  if (python) return python;
  throw new Error('No project virtual environment found. Create .venv (python -m venv .venv) before inspecting or updating Python packages.');
}
export function parseNodeOutdated(raw: string): Record<string, { current?: string; wanted?: string; latest?: string }> {
  if (!raw.trim()) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== 'object' || value.error) throw new Error('Invalid outdated response');
    for (const info of Object.values(value)) {
      if (!info || typeof info !== 'object' || typeof (info as { latest?: unknown }).latest !== 'string') throw new Error('Invalid package entry');
    }
    return value;
  } catch { throw new Error('Could not parse dependency scan output. No dependency health result is available.'); }
}
export async function scanNode(cwd: string) {
  const manager = packageManager(cwd);
  if (manager === 'bun') throw new Error('Bun dependency scanning is not supported by this version. Run bun outdated in the project shell.');
  if (manager === 'yarn') {
    // Yarn Classic emits JSON lines; modern Yarn needs an explicit plugin.
    const raw = await execTool('yarn', cwd, ['outdated', '--json'], { okCodes: [0, 1] });
    const records = raw.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    if (records.some(record => record.type === 'error')) throw new Error(records.find(record => record.type === 'error').data);
    const table = records.find(record => record.type === 'table');
    if (!table) {
      if (records.some(record => record.type === 'info' && /up.to.date|no outdated/i.test(record.data))) return { manager, packages: {} };
      throw new Error('Yarn did not return an outdated table. This scanner supports Yarn Classic; use the project shell for modern Yarn.');
    }
    return { manager, packages: Object.fromEntries(table.data.body.map((row: string[]) => [row[0], { current: row[1], wanted: row[2], latest: row[3] }])) as ReturnType<typeof parseNodeOutdated> };
  }
  const raw = manager === 'npm' ? await execNpm(cwd, ['outdated', '--json']) : await execTool('pnpm', cwd, ['outdated', '--format', 'json'], { okCodes: [0, 1] });
  return { manager, packages: parseNodeOutdated(raw) };
}
export async function updateNode(cwd: string, name: string | null) {
  const manager = packageManager(cwd);
  const args = manager === 'npm' ? ['update', ...(name ? [name] : [])]
    : manager === 'pnpm' ? ['update', ...(name ? [name] : [])]
      : manager === 'yarn' ? ['upgrade', ...(name ? [name] : [])] : ['update', ...(name ? [name] : [])];
  const backups = await backupFiles(cwd, ['package.json', ...LOCKFILES.map(lock => lock.file)]);
  const output = manager === 'npm' ? await execNpm(cwd, args, { timeoutMs: 300000 }) : await execTool(manager, cwd, args, { timeoutMs: 300000 });
  return { success: true, output: output.trim().slice(-2000), backups, packageManager: manager };
}
