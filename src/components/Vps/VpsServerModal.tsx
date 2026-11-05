/**
 * Add / edit VPS server. Secrets are sent once to the main process and never
 * read back: on edit, the credential field is optional (leave blank to keep the
 * stored one).
 */
import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/I18nContext'
import type { VpsAuthKind, VpsEnvironment, VpsHostKeyInfo, VpsPolicy, VpsServer, VpsServerInput } from '../../types/vps'
import type { VpsSecretInput } from '../../data/vps'

export interface VpsServerFormResult {
  input: VpsServerInput
  /** undefined keeps the existing credential (edit with blank secret). */
  secret?: VpsSecretInput
}

interface VpsServerModalProps {
  open: boolean
  initial: VpsServer | null
  onClose: () => void
  onSubmit: (result: VpsServerFormResult) => Promise<{ success: boolean; error?: string }>
  onTest: (input: VpsServerInput, secret?: VpsSecretInput) => Promise<{ success: boolean; error?: string; hostKey?: VpsHostKeyInfo }>
}

const EMPTY: VpsServerInput = {
  name: '',
  host: '',
  port: 22,
  username: 'root',
  environment: 'development',
  policy: 'read-only',
  authKind: 'key',
  defaultCwd: '',
  tags: [],
}

const field = 'w-full rounded-lg bg-surface-2 border border-border px-2.5 py-1.5 text-xs text-ink focus:outline-2 focus:outline-accent'

export default function VpsServerModal({ open, initial, onClose, onSubmit, onTest }: VpsServerModalProps) {
  const { t } = useI18n()
  const [form, setForm] = useState<VpsServerInput>(EMPTY)
  const [tagsText, setTagsText] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [password, setPassword] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; hostKey?: VpsHostKeyInfo } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(initial ? {
      name: initial.name,
      host: initial.host,
      port: initial.port,
      username: initial.username,
      environment: initial.environment,
      policy: initial.policy,
      authKind: initial.authKind,
      defaultCwd: initial.defaultCwd,
      tags: initial.tags,
    } : EMPTY)
    setTagsText(initial ? initial.tags.join(', ') : '')
    setPrivateKey('')
    setPassphrase('')
    setPassword('')
    setTestResult(null)
    setError(null)
  }, [open, initial])

  if (!open) return null

  const buildSecret = (): VpsSecretInput | undefined => {
    if (form.authKind === 'agent') return { kind: 'agent' }
    if (form.authKind === 'password') return password ? { kind: 'password', password } : undefined
    return privateKey ? { kind: 'key', privateKey, ...(passphrase ? { passphrase } : {}) } : undefined
  }

  const inputWithTags = (): VpsServerInput => ({
    ...form,
    tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
  })

  const handleTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const secret = buildSecret()
      const result = await onTest(inputWithTags(), secret)
      setTestResult(result)
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const secret = buildSecret()
      if (!initial && !secret) {
        setError(t('vps.secretRequired'))
        return
      }
      const result = await onSubmit({ input: inputWithTags(), secret })
      if (!result.success) setError(result.error || t('vps.saveFailed'))
      else onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={initial ? t('vps.editServer') : t('vps.addServer')}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-xl">
        <h2 className="font-display text-sm font-bold text-ink">{initial ? t('vps.editServer') : t('vps.addServer')}</h2>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label htmlFor="vps-name" className="col-span-2 text-[11px] text-ink-soft">
            {t('vps.name')}
            <input id="vps-name" className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label htmlFor="vps-host" className="text-[11px] text-ink-soft">
            {t('vps.host')}
            <input id="vps-host" className={field} value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="203.0.113.10" />
          </label>
          <label htmlFor="vps-port" className="text-[11px] text-ink-soft">
            {t('vps.port')}
            <input id="vps-port" className={field} type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
          </label>
          <label htmlFor="vps-username" className="text-[11px] text-ink-soft">
            {t('vps.username')}
            <input id="vps-username" className={field} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label className="text-[11px] text-ink-soft">
            {t('vps.environment')}
            <select className={field} value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value as VpsEnvironment })}>
              <option value="development">development</option>
              <option value="staging">staging</option>
              <option value="production">production</option>
            </select>
          </label>
          <label className="text-[11px] text-ink-soft">
            {t('vps.policy')}
            <select className={field} value={form.policy} onChange={(e) => setForm({ ...form, policy: e.target.value as VpsPolicy })}>
              <option value="read-only">read-only</option>
              <option value="controlled">controlled</option>
              <option value="auto">Auto — {t('vps.autoApproval')}</option>
              <option value="full-access">Full access</option>
              <option value="agent-disabled">agent-disabled</option>
            </select>
            {(form.policy === 'auto' || form.policy === 'full-access') && (
              <p className="mt-1 text-[10px] text-ink-faint">{t(form.policy === 'auto' ? 'vps.autoModeHint' : 'vps.fullAccessHint')}</p>
            )}
          </label>
          <label className="text-[11px] text-ink-soft">
            {t('vps.authKind')}
            <select className={field} value={form.authKind} onChange={(e) => setForm({ ...form, authKind: e.target.value as VpsAuthKind })}>
              <option value="key">{t('vps.authKey')}</option>
              <option value="password">{t('vps.authPassword')}</option>
              <option value="agent">{t('vps.authAgent')}</option>
            </select>
          </label>
          <label htmlFor="vps-default-cwd" className="col-span-2 text-[11px] text-ink-soft">
            {t('vps.defaultCwd')}
            <input id="vps-default-cwd" className={field} value={form.defaultCwd} onChange={(e) => setForm({ ...form, defaultCwd: e.target.value })} placeholder="/var/www/app" />
          </label>
          <label htmlFor="vps-tags" className="col-span-2 text-[11px] text-ink-soft">
            {t('vps.tags')}
            <input id="vps-tags" className={field} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="web, api" />
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 space-y-3">
          <p className="text-[11px] font-semibold text-ink-soft">
            {initial ? t('vps.credentialKeepBlank') : t('vps.credential')}
          </p>
          {form.authKind === 'key' && (
            <>
              <textarea
                id="vps-private-key"
                className={`${field} h-24 font-mono`}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                aria-label={t('vps.privateKey')}
              />
              <input className={field} type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder={t('vps.passphrase')} aria-label={t('vps.passphrase')} />
            </>
          )}
          {form.authKind === 'password' && (
            <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('vps.password')} aria-label={t('vps.password')} />
          )}
          {form.authKind === 'agent' && (
            <p className="text-[11px] text-ink-faint">{t('vps.agentAuthHint')}</p>
          )}
        </div>

        {testResult && (
          <div className={`mt-3 rounded-lg border p-3 text-[11px] ${testResult.success ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`} role="status">
            <p>{testResult.success ? t('vps.testOk') : (testResult.error || t('vps.testFailed'))}</p>
            {testResult.hostKey && (
              <p className="mt-1 font-mono break-all text-ink-soft">
                {t('vps.hostKeyFingerprint')}: {testResult.hostKey.fingerprint}
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-[11px] text-danger" role="alert">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-3">
            {t('vps.cancel')}
          </button>
          <button type="button" onClick={handleTest} disabled={testing} className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-3 disabled:opacity-50">
            {testing ? t('vps.testing') : t('vps.testConnection')}
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50">
            {saving ? t('vps.saving') : t('vps.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
