// @ts-check
const path = require('path')
const os = require('os')
const fs = require('fs').promises
const yaml = require('js-yaml')

const AGENT_DIR = (homeDir) => path.join(homeDir, '.omp', 'agent')
const MODELS_PATH = (homeDir) => path.join(AGENT_DIR(homeDir), 'models.yml')
const CONFIG_PATH = (homeDir) => path.join(AGENT_DIR(homeDir), 'config.yml')

/**
 * OmpConfig — read/write the oh-my-pi agent configuration (~/.omp/agent).
 *
 * omp keeps provider/model definitions in models.yml and runtime settings
 * (including the default model role) in config.yml. We never touch provider
 * secrets beyond what the user types into the form; every write is preceded
 * by a timestamped backup so a bad merge can always be rolled back.
 *
 * @param {string} [homeDir] - override for os.homedir() (used in tests)
 */
class OmpConfig {
  constructor(homeDir) {
    this.homeDir = homeDir || os.homedir()
  }

  /** @returns {string} absolute path of the agent config directory */
  getAgentDir() {
    return AGENT_DIR(this.homeDir)
  }

  /**
   * @typedef {{providers?: Record<string, {baseUrl?: string, api?: string, apiKey?: string, authHeader?: boolean, disableStrictTools?: boolean, models?: Array<{id: string, name?: string}>, discovery?: object}>}} ModelsDoc
   * @returns {Promise<ModelsDoc>} parsed models.yml (providers map)
   */
  async readModels() {
    try {
      const parsed = yaml.load(await fs.readFile(MODELS_PATH(this.homeDir), 'utf8'))
      return parsed && typeof parsed === 'object' ? /** @type {ModelsDoc} */ (parsed) : {}
    } catch {
      return {}
    }
  }

  /** @returns {Promise<{providers: Array<{name: string, models: Array<{id: string, name?: string}>}>}>} */
  async listProviders() {
    const models = await this.readModels()
    const providers = Object.entries(models.providers || {}).map(([name, entry]) => ({
      name,
      baseUrl: entry.baseUrl || '',
      api: entry.api || 'openai-completions',
      apiKey: entry.apiKey ? (entry.apiKey.length > 8 ? `${entry.apiKey.slice(0, 3)}…${entry.apiKey.slice(-3)}` : '••••') : '',
      modelCount: Array.isArray(entry.models) ? entry.models.length : (entry.discovery ? 'auto' : 0),
      models: Array.isArray(entry.models)
        ? entry.models.map((model) => ({ id: model.id, name: model.name || model.id }))
        : [],
    }))
    return { providers }
  }

  /** @returns {Promise<string|null>} current default model as "provider/model" */
  async getDefaultModel() {
    try {
      const parsed = yaml.load(await fs.readFile(CONFIG_PATH(this.homeDir), 'utf8'))
      return parsed?.modelRoles?.default || null
    } catch {
      return null
    }
  }

  /** @returns {Promise<{providers: Array<object>, defaultModel: string|null, configPath: string}>} */
  async getConfig() {
    const { providers } = await this.listProviders()
    return { providers, defaultModel: await this.getDefaultModel(), configPath: CONFIG_PATH(this.homeDir) }
  }

  /**
   * Merge a provider entry into models.yml (creating the file if needed).
   * @param {{name?: string, baseUrl?: string, apiKey?: string, api?: string, models?: Array<{id: string, name?: string}>, discovery?: object, authHeader?: boolean, disableStrictTools?: boolean}} input
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async saveProvider(input) {
    const name = String(input.name || '').trim()
    if (!name) return { success: false, error: 'Provider name is required' }
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return { success: false, error: 'Provider name may only contain letters, numbers, dots, dashes and underscores' }
    }
    if (!String(input.baseUrl || '').trim()) return { success: false, error: 'Base URL is required' }
    let baseUrl = String(input.baseUrl).trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`

    const providers = (await this.readModels()).providers || {}
    const entry = {
      baseUrl,
      api: input.api || 'openai-completions',
    }
    const apiKey = String(input.apiKey || '').trim()
    if (apiKey) entry.apiKey = apiKey
    if (input.authHeader === true) entry.authHeader = true
    if (input.disableStrictTools === true) entry.disableStrictTools = true

    const models = Array.isArray(input.models)
      ? input.models.map((model) => ({ id: model.id, name: model.name || model.id }))
      : []
    if (models.length) entry.models = models
    if (input.discovery) entry.discovery = input.discovery

    providers[name] = entry
    await this._writeWithBackup(MODELS_PATH(this.homeDir), { providers })
    return { success: true }
  }

  /** @param {string} name @returns {Promise<{success: boolean, error?: string}>} */
  async deleteProvider(name) {
    const models = await this.readModels()
    if (!models.providers || !models.providers[name]) {
      return { success: false, error: `Provider "${name}" not found` }
    }
    delete models.providers[name]
    await this._writeWithBackup(MODELS_PATH(this.homeDir), models)
    return { success: true }
  }

  /** @param {string} modelRef - "provider/modelId" @returns {Promise<{success: boolean, error?: string}>} */
  async setDefaultModel(modelRef) {
    const ref = String(modelRef || '').trim()
    if (!ref) return { success: false, error: 'Default model is required' }
    /** @type {{modelRoles?: {default?: string}}} */
    let parsed = {}
    try {
      parsed = yaml.load(await fs.readFile(CONFIG_PATH(this.homeDir), 'utf8')) || {}
    } catch { /* fresh config */ }
    if (typeof parsed !== 'object') parsed = {}
    parsed.modelRoles = parsed.modelRoles || {}
    parsed.modelRoles.default = ref
    await this._writeWithBackup(CONFIG_PATH(this.homeDir), parsed)
    return { success: true }
  }

  async _writeWithBackup(filePath, data) {
    await fs.mkdir(AGENT_DIR(this.homeDir), { recursive: true })
    try {
      const existing = await fs.readFile(filePath, 'utf8')
      await fs.writeFile(`${filePath}.bak-${Date.now()}`, existing, 'utf8')
    } catch { /* no previous file */ }
    await fs.writeFile(filePath, yaml.dump(data, { lineWidth: 120 }), 'utf8')
  }
}

module.exports = OmpConfig
