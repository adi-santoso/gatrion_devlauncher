/**
 * AI-agent domain (oh-my-pi CLI) — session management, chat, model/config
 * control, installation and event streams. Falls back to browser dev-mode
 * mocks when the Electron bridge is absent.
 */
import { invoke, isElectron, subscribe, SimpleResult } from './ipcCore'
import type { AgentSession } from '../types/shared'

export interface OmpStatusResult extends SimpleResult {
  installed: boolean
  version: string | null
  binaryPath: string | null
  configured: boolean
}

export interface SessionsResult {
  success: boolean
  sessions: AgentSession[]
  error?: string
}

export interface SessionResult {
  success: boolean
  session?: AgentSession
  error?: string
}

export interface MessagesResult {
  success: boolean
  messages: unknown[]
  error?: string
}

export interface ModelsResult {
  success: boolean
  models: Array<{ id: string; name?: string; [key: string]: unknown }>
  error?: string
}

export interface OmpStateResult {
  success: boolean
  state: { thinkingLevel?: string | null; [key: string]: unknown }
  error?: string
}

export interface CommandsResult {
  success: boolean
  commands: unknown[]
  error?: string
}

export interface ChatOptions {
  [key: string]: unknown
}

export interface ChatResult extends SimpleResult {
  session?: AgentSession
  [key: string]: unknown
}

export interface InstallStateResult {
  success: boolean
  status: string
  error?: string
  [key: string]: unknown
}

export interface CheckUpdateResult {
  success: boolean
  latest: string | null
  error?: string
}

export interface OmpConfigResult {
  success: boolean
  providers: unknown[]
  defaultModel: string | null
  configPath: string | null
  error?: string
}

export interface SearchFilesResult {
  success: boolean
  files: unknown[]
  error?: string
}

export const ompStatus = async (): Promise<OmpStatusResult> => {
  if (!isElectron()) return { success: true, installed: false, version: null, binaryPath: null, configured: false }
  return invoke<OmpStatusResult>('ompStatus')
}

export const ompListSessions = async (projectId: string): Promise<SessionsResult> => {
  if (!isElectron()) return { success: true, sessions: [] }
  return invoke<SessionsResult>('ompListSessions', projectId)
}

export const ompListAllSessions = async (): Promise<SessionsResult> => {
  if (!isElectron()) return { success: true, sessions: [] }
  return invoke<SessionsResult>('ompListAllSessions')
}

export const searchWorkspaceFiles = async (query: string, projectPaths: string[]): Promise<SearchFilesResult> => {
  if (!isElectron()) return { success: true, files: [] }
  return invoke<SearchFilesResult>('searchWorkspaceFiles', query, projectPaths)
}

export const ompCreateSession = async (projectId: string, title = ''): Promise<SessionResult> => {
  if (!isElectron()) return { success: true, session: { id: 'mock', title: title || 'Session', projectId } }
  return invoke<SessionResult>('ompCreateSession', projectId, title)
}

export const ompDeleteSession = async (projectId: string, sessionId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompDeleteSession', projectId, sessionId)
}

export const ompRenameSession = async (projectId: string, sessionId: string, title: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompRenameSession', projectId, sessionId, title)
}

export const ompUpdateSessionTokens = async (projectId: string, sessionId: string, tokens: number, cost: number): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompUpdateSessionTokens', projectId, sessionId, tokens, cost)
}

export const ompChat = async (projectId: string, cwd: string, message: string, options: ChatOptions = {}): Promise<ChatResult> => {
  if (!isElectron()) return { success: false, error: 'Electron not available' }
  return invoke<ChatResult>('ompChat', projectId, cwd, message, options)
}

export const ompSteer = async (projectId: string, cwd: string, message: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompSteer', projectId, cwd, message)
}

export const ompAbort = async (projectId: string, cwd: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompAbort', projectId, cwd)
}

export const ompGetMessages = async (projectId: string, cwd: string, options: ChatOptions = {}): Promise<MessagesResult> => {
  if (!isElectron()) return { success: true, messages: [] }
  return invoke<MessagesResult>('ompGetMessages', projectId, cwd, options)
}

export const ompGetModels = async (projectId: string, cwd: string): Promise<ModelsResult> => {
  if (!isElectron()) return { success: true, models: [] }
  return invoke<ModelsResult>('ompGetModels', projectId, cwd)
}

export const ompSetModel = async (projectId: string, cwd: string, provider: string, modelId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompSetModel', projectId, cwd, provider, modelId)
}

export const ompSetThinkingLevel = async (projectId: string, cwd: string, level: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompSetThinkingLevel', projectId, cwd, level)
}

export const ompGetState = async (projectId: string, cwd: string): Promise<OmpStateResult> => {
  if (!isElectron()) return { success: true, state: { thinkingLevel: null } }
  return invoke<OmpStateResult>('ompGetState', projectId, cwd)
}

export const ompCompact = async (projectId: string, cwd: string, customInstructions: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompCompact', projectId, cwd, customInstructions)
}

export const ompSetAutoCompaction = async (projectId: string, cwd: string, enabled: boolean): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompSetAutoCompaction', projectId, cwd, enabled)
}

export const ompSetAutoRetry = async (projectId: string, cwd: string, enabled: boolean): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompSetAutoRetry', projectId, cwd, enabled)
}

export const ompAbortRetry = async (projectId: string, cwd: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompAbortRetry', projectId, cwd)
}

export const ompSetFastMode = async (projectId: string, cwd: string, enabled: boolean): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompSetFastMode', projectId, cwd, enabled)
}

export const ompGetCommands = async (projectId: string, cwd: string): Promise<CommandsResult> => {
  if (!isElectron()) return { success: true, commands: [] }
  return invoke<CommandsResult>('ompGetCommands', projectId, cwd)
}

export const ompExportConversation = async (projectId: string, cwd: string, sessionPath: string, title: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Electron not available' }
  return invoke<SimpleResult>('ompExportConversation', projectId, cwd, sessionPath, title)
}

export const ompTogglePin = async (projectId: string, sessionId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompTogglePin', projectId, sessionId)
}

export const ompBranch = async (projectId: string, cwd: string, entryId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompBranch', projectId, cwd, entryId)
}

export const ompGetBranchMessages = async (projectId: string, cwd: string): Promise<MessagesResult> => {
  if (!isElectron()) return { success: true, messages: [] }
  return invoke<MessagesResult>('ompGetBranchMessages', projectId, cwd)
}

export const ompSetSubagentSubscription = async (projectId: string, cwd: string, level: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompSetSubagentSubscription', projectId, cwd, level)
}

export const ompGetSubagents = async (projectId: string, cwd: string): Promise<SimpleResult & { subagents?: unknown[] }> => {
  if (!isElectron()) return { success: true, subagents: [] }
  return invoke<SimpleResult & { subagents?: unknown[] }>('ompGetSubagents', projectId, cwd)
}

export const ompHandoff = async (projectId: string, cwd: string, customInstructions: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompHandoff', projectId, cwd, customInstructions)
}

export const ompBash = async (projectId: string, cwd: string, command: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Electron not available' }
  return invoke<SimpleResult>('ompBash', projectId, cwd, command)
}

export const ompAbortBash = async (projectId: string, cwd: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompAbortBash', projectId, cwd)
}

export const ompInstall = async (): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Electron not available' }
  return invoke<SimpleResult>('ompInstall')
}

export const ompInstallState = async (): Promise<InstallStateResult> => {
  if (!isElectron()) return { success: true, status: 'idle' }
  return invoke<InstallStateResult>('ompInstallState')
}

export const ompCheckUpdate = async (): Promise<CheckUpdateResult> => {
  if (!isElectron()) return { success: true, latest: null }
  return invoke<CheckUpdateResult>('ompCheckUpdate')
}

export const ompOpenDocs = async (): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompOpenDocs')
}

export const ompConfigGet = async (): Promise<OmpConfigResult> => {
  if (!isElectron()) return { success: true, providers: [], defaultModel: null, configPath: null }
  return invoke<OmpConfigResult>('ompConfigGet')
}

export const ompConfigSaveProvider = async (input: unknown): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Electron not available' }
  return invoke<SimpleResult>('ompConfigSaveProvider', input)
}

export const ompConfigDeleteProvider = async (name: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompConfigDeleteProvider', name)
}

export const ompConfigSetDefault = async (modelRef: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('ompConfigSetDefault', modelRef)
}

export const ompRunSetup = async (): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Electron not available' }
  return invoke<SimpleResult>('ompRunSetup')
}

/** Push channel — agent lifecycle events (session started, finished, etc.). */
export const onOmpEvent = (callback: (event: unknown) => void): (() => void) => {
  if (!isElectron()) return () => {}
  return subscribe('onOmpEvent', (event) => callback(event))
}

/** Push channel — agent installer progress. */
export const onOmpInstallProgress = (callback: (state: unknown) => void): (() => void) => {
  if (!isElectron()) return () => {}
  return subscribe('onOmpInstallProgress', (state) => callback(state))
}
