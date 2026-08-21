/**
 * Dependency management domain — Composer (PHP), Go modules, Python/pip and
 * Rust/Cargo. Each matches the npm pattern: an `outdated` inspection call plus
 * an `update` call. Falls back to browser dev-mode mocks when Electron is absent.
 */
import { invoke, isElectron, SimpleResult } from './ipcCore'

export interface OutdatedDependency {
  name: string;
  current: string | null;
  wanted: string | null;
  latest: string | null;
  type: string;
}

export interface ComposerOutdatedResult extends SimpleResult {
  outdated?: OutdatedDependency[];
  hasComposerJson?: boolean;
}
export interface GoOutdatedResult extends SimpleResult {
  outdated?: OutdatedDependency[];
  hasGoMod?: boolean;
}
export interface PipOutdatedResult extends SimpleResult {
  outdated?: OutdatedDependency[];
  hasPipManifest?: boolean;
}
export interface CargoOutdatedResult extends SimpleResult {
  outdated?: OutdatedDependency[];
  hasCargo?: boolean;
  pluginMissing?: boolean;
}

// --- Composer (PHP) ---
export const composerOutdated = async (projectPath: string): Promise<ComposerOutdatedResult> => {
  if (!isElectron()) return { success: true, hasComposerJson: false, outdated: [] }
  return invoke<ComposerOutdatedResult>('composerOutdated', projectPath)
}

export const composerUpdate = async (projectPath: string, packageName: string | null = null): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('composerUpdate', projectPath, packageName)
}

// --- Go modules ---
export const goOutdated = async (projectPath: string): Promise<GoOutdatedResult> => {
  if (!isElectron()) return { success: true, hasGoMod: false, outdated: [] }
  return invoke<GoOutdatedResult>('goOutdated', projectPath)
}

export const goUpdate = async (projectPath: string, moduleName: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('goUpdate', projectPath, moduleName)
}

// --- Python / pip ---
export const pipOutdated = async (projectPath: string): Promise<PipOutdatedResult> => {
  if (!isElectron()) return { success: true, hasPipManifest: false, outdated: [] }
  return invoke<PipOutdatedResult>('pipOutdated', projectPath)
}

export const pipUpdate = async (projectPath: string, packageName: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('pipUpdate', projectPath, packageName)
}

// --- Rust / Cargo ---
export const cargoOutdated = async (projectPath: string): Promise<CargoOutdatedResult> => {
  if (!isElectron()) return { success: true, hasCargo: false, outdated: [] }
  return invoke<CargoOutdatedResult>('cargoOutdated', projectPath)
}

export const cargoUpdate = async (projectPath: string, packageName: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('cargoUpdate', projectPath, packageName)
}