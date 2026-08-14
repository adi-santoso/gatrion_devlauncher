/**
 * Git & package-management domain — repository operations, stash, scripts,
 * dependency checks and npm commands. Falls back to browser dev-mode mocks
 * when the Electron bridge is absent.
 */
import { invoke, isElectron, SimpleResult } from './ipcCore'


export interface GitStatusResult extends SimpleResult {
  status?: string
  branch?: string
  ahead?: number
  behind?: number
  dirty?: boolean
}

export interface GitCommitEntry {
  hash: string
  message: string
  author?: string
  date?: string
}

export interface GitLogResult extends SimpleResult {
  commits?: GitCommitEntry[]
}

export interface GitDiffResult extends SimpleResult {
  diff?: string
}

export interface GitStashEntry {
  index: number
  message?: string
  [key: string]: unknown
}

export interface ScriptsResult extends SimpleResult {
  scripts?: string[]
}

export interface DependenciesResult extends SimpleResult {
  dependencies?: Array<{ name: string; current?: string; wanted?: string; latest?: string; [key: string]: unknown }>
}

export const gitStatus = async (projectPath: string): Promise<GitStatusResult> => {
  if (!isElectron()) {
    return { success: true, status: 'clean', branch: 'main' }
  }
  return invoke<GitStatusResult>('gitStatus', projectPath)
}

export const gitLog = async (projectPath: string, limit = 15): Promise<GitLogResult> => {
  if (!isElectron()) {
    return { success: true, commits: [] }
  }
  return invoke<GitLogResult>('gitLog', projectPath, limit)
}

export const gitDiff = async (projectPath: string, filePath: string, staged = false): Promise<GitDiffResult> => {
  if (!isElectron()) {
    return { success: true, diff: '' }
  }
  return invoke<GitDiffResult>('gitDiff', projectPath, filePath, staged)
}

export const gitStage = async (projectPath: string, files: string[]): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitStage', projectPath, files)
}

export const gitUnstage = async (projectPath: string, files: string[]): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitUnstage', projectPath, files)
}

export const gitCommit = async (projectPath: string, message: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitCommit', projectPath, message)
}

export const gitPull = async (projectPath: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitPull', projectPath)
}

export const gitPush = async (projectPath: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitPush', projectPath)
}

export const gitCheckout = async (projectPath: string, branch: string, createNew = false): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitCheckout', projectPath, branch, createNew)
}

export const gitInit = async (projectPath: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitInit', projectPath)
}

export const gitStashList = async (projectPath: string): Promise<SimpleResult & { stashes?: GitStashEntry[] }> => {
  if (!isElectron()) {
    return { success: true, stashes: [] }
  }
  return invoke<SimpleResult & { stashes?: GitStashEntry[] }>('gitStashList', projectPath)
}

export const gitStashPush = async (projectPath: string, message: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitStashPush', projectPath, message)
}

export const gitStashPop = async (projectPath: string, index = 0): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitStashPop', projectPath, index)
}

export const gitStashApply = async (projectPath: string, index = 0): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitStashApply', projectPath, index)
}

export const gitStashDrop = async (projectPath: string, index = 0): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitStashDrop', projectPath, index)
}

export const gitDiscard = async (projectPath: string, filePath: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitDiscard', projectPath, filePath)
}

export const gitBlame = async (projectPath: string, filePath: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('gitBlame', projectPath, filePath)
}

export const readPackageScripts = async (projectPath: string): Promise<ScriptsResult> => {
  if (!isElectron()) {
    return { success: true, scripts: [] }
  }
  return invoke<ScriptsResult>('readPackageScripts', projectPath)
}

export const checkDependencies = async (projectPath: string): Promise<DependenciesResult> => {
  if (!isElectron()) {
    return { success: true, dependencies: [] }
  }
  return invoke<DependenciesResult>('checkDependencies', projectPath)
}

export const runProjectScript = async (projectId: string, scriptName: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('runProjectScript', projectId, scriptName)
}

export const installDependencies = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('installDependencies', projectId)
}

export const npmOutdated = async (projectPath: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('npmOutdated', projectPath)
}

export const npmUpdate = async (projectPath: string, packageName: string | null = null): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('npmUpdate', projectPath, packageName)
}
