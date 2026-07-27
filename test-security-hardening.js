const assert = require('assert')
const { redactSensitiveEnv, isSensitiveKey, sanitizeProjectChanges } = require('./electron/projectSchema')

function runSecurityTests() {
  console.log('[Security Hardening Test] Starting verification...')

  // Test 1: Sensitive Key Detection
  assert.strictEqual(isSensitiveKey('DB_PASSWORD'), true, 'DB_PASSWORD should be recognized as sensitive')
  assert.strictEqual(isSensitiveKey('API_SECRET_KEY'), true, 'API_SECRET_KEY should be recognized as sensitive')
  assert.strictEqual(isSensitiveKey('AUTH_TOKEN'), true, 'AUTH_TOKEN should be recognized as sensitive')
  assert.strictEqual(isSensitiveKey('APP_NAME'), false, 'APP_NAME should not be sensitive')
  assert.strictEqual(isSensitiveKey('NODE_ENV'), false, 'NODE_ENV should not be sensitive')

  // Test 2: Redacting Sensitive Env Values (Array & Object formats)
  const envArray = [
    { key: 'APP_ENV', value: 'production' },
    { key: 'DB_PASSWORD', value: 'super_secret_123' },
    { key: 'VITE_API_KEY', value: 'xyz987654321' }
  ]
  const redactedArray = redactSensitiveEnv(envArray)
  assert.strictEqual(redactedArray[0].value, 'production', 'Non-sensitive env should remain unchanged')
  assert.strictEqual(redactedArray[1].value, '••••••••', 'DB_PASSWORD value must be masked')
  assert.strictEqual(redactedArray[2].value, '••••••••', 'VITE_API_KEY value must be masked')

  const envObject = {
    PUBLIC_URL: 'http://localhost:3000',
    JWT_SECRET: 'my-jwt-secret-key'
  }
  const redactedObject = redactSensitiveEnv(envObject)
  assert.strictEqual(redactedObject.PUBLIC_URL, 'http://localhost:3000')
  assert.strictEqual(redactedObject.JWT_SECRET, '••••••••')

  // Test 3: Allowlist Sanitization (update-project fields)
  assert.throws(() => {
    sanitizeProjectChanges({ name: 'Valid Project', status: 'running' })
  }, /Unsupported project field: status/, 'Must reject attempts to modify status')

  assert.throws(() => {
    sanitizeProjectChanges({ name: 'Valid Project', id: 'fake-id' })
  }, /Unsupported project field: id/, 'Must reject attempts to modify id')

  assert.throws(() => {
    sanitizeProjectChanges({ name: 'Valid Project', pid: 1234 })
  }, /Unsupported project field: pid/, 'Must reject attempts to modify pid')

  const validChanges = sanitizeProjectChanges({
    name: 'New Name',
    port: 5173,
    startCommand: 'npm run dev',
    autoStart: true
  })
  assert.strictEqual(validChanges.name, 'New Name')
  assert.strictEqual(validChanges.port, 5173)

  // Test 4: URL Scheme Restriction Simulation
  const validateUrl = (url) => {
    if (!url || typeof url !== 'string') return false
    try {
      const parsed = new URL(url.trim())
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  assert.strictEqual(validateUrl('http://localhost:5173'), true, 'http URL must be valid')
  assert.strictEqual(validateUrl('https://example.com/api'), true, 'https URL must be valid')
  assert.strictEqual(validateUrl('file:///C:/Windows/System32/cmd.exe'), false, 'file URL must be rejected')
  assert.strictEqual(validateUrl('javascript:alert(1)'), false, 'javascript URL must be rejected')
  assert.strictEqual(validateUrl('powershell:Start-Process'), false, 'powershell URL must be rejected')

  console.log('[Security Hardening Test] All security tests passed successfully!')
}

runSecurityTests()
