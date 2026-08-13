/* OmpConfig unit tests — uses a temp HOME so the real ~/.omp is never touched. */
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const OmpConfig = require('./electron/managers/OmpConfig')

async function run() {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-config-test-'))
  const config = new OmpConfig(homeDir)

  // 1. Empty state: no providers, no default model
  let data = await config.getConfig()
  assert.strictEqual(data.providers.length, 0, 'starts with no providers')
  assert.strictEqual(data.defaultModel, null, 'starts without default model')

  // 2. Save a provider with models
  let result = await config.saveProvider({
    name: 'my-gateway',
    baseUrl: 'https://gateway.example.com/v1',
    api: 'openai-completions',
    apiKey: 'sk-test-123',
    models: [{ id: 'gpt-4o-mini', name: 'GPT-4o mini' }, { id: 'claude-sonnet-4.5' }],
    authHeader: true,
  })
  assert.strictEqual(result.success, true, 'provider saved')
  data = await config.getConfig()
  assert.strictEqual(data.providers.length, 1, 'one provider listed')
  assert.strictEqual(data.providers[0].name, 'my-gateway', 'provider name')
  assert.strictEqual(data.providers[0].modelCount, 2, 'model count')
  assert.ok(data.providers[0].apiKey.includes('…'), 'api key is masked in listing')

  // 3. Merge preserves an existing provider (adds a second one)
  await config.saveProvider({ name: 'vllm', baseUrl: 'http://192.168.5.3:8085/v1', api: 'openai-completions' })
  data = await config.getConfig()
  assert.strictEqual(data.providers.length, 2, 'second provider appended without clobbering')
  assert.ok(data.providers.some((provider) => provider.name === 'my-gateway'), 'first provider still present')

  // 4. Validation
  result = await config.saveProvider({ name: '', baseUrl: 'https://x.com' })
  assert.strictEqual(result.success, false, 'empty name rejected')
  result = await config.saveProvider({ name: 'bad name!', baseUrl: 'https://x.com' })
  assert.strictEqual(result.success, false, 'invalid name rejected')
  result = await config.saveProvider({ name: 'no-url', baseUrl: '' })
  assert.strictEqual(result.success, false, 'empty baseUrl rejected')

  // 5. Default model set + read back from config.yml
  result = await config.setDefaultModel('my-gateway/gpt-4o-mini')
  assert.strictEqual(result.success, true, 'default model set')
  assert.strictEqual(await config.getDefaultModel(), 'my-gateway/gpt-4o-mini', 'default read back')

  // 6. Delete provider
  result = await config.deleteProvider('vllm')
  assert.strictEqual(result.success, true, 'provider deleted')
  data = await config.getConfig()
  assert.strictEqual(data.providers.length, 1, 'one provider remains')
  result = await config.deleteProvider('does-not-exist')
  assert.strictEqual(result.success, false, 'missing provider delete fails cleanly')

  // 7. Backups were created for every write (models.yml + config.yml)
  const agentDir = path.join(homeDir, '.omp', 'agent')
  const backups = fs.readdirSync(agentDir).filter((file) => file.includes('.bak-'))
  assert.ok(backups.length >= 2, `backups created (got ${backups.length})`)

  // 8. Re-instantiate from disk (persistence across restarts)
  const reloaded = new OmpConfig(homeDir)
  const persisted = await reloaded.getConfig()
  assert.strictEqual(persisted.providers.length, 1, 'persisted after reload')
  assert.strictEqual(persisted.defaultModel, 'my-gateway/gpt-4o-mini', 'default persisted after reload')

  fs.rmSync(homeDir, { recursive: true, force: true })
  console.log('OmpConfig checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
