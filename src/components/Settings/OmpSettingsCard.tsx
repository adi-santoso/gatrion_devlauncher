import { useCallback, useEffect, useState } from 'react';
import Icon from '../Common/Icon';
import * as ipc from '../../utils/ipcRenderer';
import type { InstallStateResult, OmpStatusResult } from '../../data/agent';

const API_TYPES: Array<[string, string]> = [
  ['openai-completions', 'OpenAI completions (/v1/chat/completions)'],
  ['openai-responses', 'OpenAI responses (/v1/responses)'],
  ['anthropic-messages', 'Anthropic messages (/v1/messages)'],
  ['google-generative-ai', 'Google Generative AI'],
  ['google-gemini-cli', 'Google Gemini CLI'],
  ['azure-openai-responses', 'Azure OpenAI responses'],
  ['bedrock-converse-stream', 'AWS Bedrock Converse'],
];

interface ProviderModel {
  id: string;
  name?: string;
}

interface OmpProviderInfo {
  name: string;
  baseUrl: string;
  modelCount: number;
  apiKey?: string;
  models?: ProviderModel[];
}

interface ProviderForm {
  name: string;
  baseUrl: string;
  api: string;
  apiKey: string;
  models: string;
  authHeader: boolean;
  disableStrictTools: boolean;
}

const EMPTY_FORM: ProviderForm = { name: '', baseUrl: '', api: 'openai-completions', apiKey: '', models: '', authHeader: false, disableStrictTools: false };

interface OmpSettingsCardProps {
  onNotifyStatus?: (payload: { type: 'success' | 'error'; text: string }) => void;
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`w-2 h-2 rounded-full ${ok ? 'bg-success' : 'bg-ink-faint'}`} />;
}

export default function OmpSettingsCard({ onNotifyStatus }: OmpSettingsCardProps) {
  const [status, setStatus] = useState<OmpStatusResult | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [config, setConfig] = useState<{ providers: OmpProviderInfo[]; defaultModel: string | null }>({ providers: [], defaultModel: null });
  const [configLoading, setConfigLoading] = useState(true);
  const [installState, setInstallState] = useState<InstallStateResult>({ success: true, status: 'idle' });
  const [updateInfo, setUpdateInfo] = useState<{ latest: string | null; size?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);

  const notify = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    onNotifyStatus?.({ type, text });
  }, [onNotifyStatus]);

  const refreshStatus = useCallback(async () => {
    const result = await ipc.ompStatus();
    if (result?.success) setStatus(result);
  }, []);

  const refreshConfig = useCallback(async () => {
    const result = await ipc.ompConfigGet();
    if (result?.success) {
      setConfig({
        providers: (result.providers as OmpProviderInfo[]) || [],
        defaultModel: result.defaultModel,
      });
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setStatusLoading(true);
    setConfigLoading(true);
    await Promise.all([refreshStatus(), refreshConfig()]);
    setStatusLoading(false);
    setConfigLoading(false);
  }, [refreshStatus, refreshConfig]);

  useEffect(() => {
    refreshAll();
    ipc.ompInstallState().then((result) => { if (result?.success) setInstallState(result); }).catch(() => {});
    return ipc.onOmpInstallProgress((state) => setInstallState(state as InstallStateResult));
  }, [refreshAll]);

  const installed = status?.installed;

  const handleInstall = async () => {
    setBusy(true);
    setMessage(null);
    const result = await ipc.ompInstall();
    setBusy(false);
    if (result?.success) {
      notify('success', 'omp installed successfully.');
      await refreshAll();
    } else {
      notify('error', result?.error || 'Install failed.');
    }
  };

  const handleCheckUpdate = async () => {
    setBusy(true);
    setMessage(null);
    const result = await ipc.ompCheckUpdate();
    setBusy(false);
    if (result?.success) {
      setUpdateInfo(result);
      notify('success', result.latest ? `Latest omp release: ${result.latest} (${(((result as { size?: number }).size ?? 0) / 1048576).toFixed(0)} MB)` : 'Already up to date');
    } else {
      notify('error', result?.error || 'Could not check for updates.');
    }
  };

  const handleRunSetup = async () => {
    const result = await ipc.ompRunSetup();
    if (!result?.success) notify('error', result?.error || 'Could not launch omp setup.');
  };

  const handleSaveProvider = async () => {
    setBusy(true);
    setMessage(null);
    const models = form.models
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [id, ...nameParts] = item.split(':');
        return { id: id.trim(), name: nameParts.join(':').trim() };
      });
    const result = await ipc.ompConfigSaveProvider({
      name: form.name,
      baseUrl: form.baseUrl,
      api: form.api,
      apiKey: form.apiKey,
      models,
      authHeader: form.authHeader,
      disableStrictTools: form.disableStrictTools,
    });
    setBusy(false);
    if (result?.success) {
      notify('success', `Provider "${form.name}" saved.`);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await refreshConfig();
    } else {
      notify('error', result?.error || 'Could not save provider.');
    }
  };

  const handleDeleteProvider = async (name: string) => {
    if (!window.confirm(`Delete provider "${name}" from models.yml?`)) return;
    setMessage(null);
    const result = await ipc.ompConfigDeleteProvider(name);
    if (result?.success) {
      notify('success', `Provider "${name}" deleted.`);
      await refreshConfig();
    } else {
      notify('error', result?.error || 'Could not delete provider.');
    }
  };

  const handleSetDefault = async (modelRef: string) => {
    setMessage(null);
    const result = await ipc.ompConfigSetDefault(modelRef);
    if (result?.success) {
      notify('success', `Default model set to ${modelRef}.`);
      await refreshConfig();
    } else {
      notify('error', result?.error || 'Could not set default model.');
    }
  };

  const modelOptions = config.providers.flatMap((provider) =>
    (provider.models || []).map((model) => ({ ref: `${provider.name}/${model.id}`, label: `${provider.name} / ${model.name || model.id}` }))
  );

  const inputClass = 'w-full bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40';
  const buttonClass = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <p className="font-display font-bold text-sm">AI Agent (oh-my-pi)</p>
        {statusLoading ? (
          <span className="text-[10px] text-ink-faint">checking…</span>
        ) : installed ? (
          <span className="flex items-center gap-1.5 text-[10px] text-success bg-success/10 border border-success/20 rounded-full px-2 py-0.5">
            <StatusDot ok /> {status?.version || 'installed'}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[10px] text-ink-faint bg-surface-2 border border-border rounded-full px-2 py-0.5">
            <StatusDot ok={false} /> not installed
          </span>
        )}
      </div>

      {message && (
        <p className={`text-[11px] px-3 py-2 rounded-lg border ${message.type === 'success' ? 'text-success border-success/25 bg-success/10' : 'text-danger border-danger/25 bg-danger/10'}`}>
          {message.text}
        </p>
      )}

      {/* Status & installation */}
      <div className="space-y-2">
        {!installed ? (
          <>
            <p className="text-[11px] text-ink-faint leading-relaxed">
              The coding agent runs on <b className="text-ink">oh-my-pi (omp)</b> — a mature open-source CLI agent.
              Install it into the app folder (no admin rights, no PATH changes) or install it yourself and it will be detected automatically.
            </p>
            {installState.status === 'downloading' ? (
              <div className="space-y-1.5">
                <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div className="h-full bg-accent transition-all duration-300" style={{ width: `${installState.percent || 0}%` }} />
                </div>
                <p className="text-[10px] text-ink-faint">
                  {installState.phase === 'verify' ? 'Verifying SHA256…' : `Downloading ${installState.version || ''}… ${installState.percent || 0}%`}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={handleInstall} disabled={busy} className={`${buttonClass} !bg-accent !text-white hover:!bg-accent-hover border-transparent font-semibold`}>
                  <Icon name="download" size={12} />
                  {busy ? 'Working…' : 'Install AI Agent'}
                </button>
                <button type="button" onClick={handleCheckUpdate} disabled={busy} className={buttonClass}>
                  Check for updates
                </button>
                <button type="button" onClick={() => ipc.ompOpenDocs()} className={buttonClass}>
                  <Icon name="external" size={11} /> Docs
                </button>
              </div>
            )}
            {installState.status === 'error' && <p className="text-[11px] text-danger">{installState.error}</p>}
            {updateInfo?.latest && <p className="text-[10px] text-ink-faint">Latest release: v{updateInfo.latest} (~{((updateInfo.size ?? 0) / 1048576).toFixed(0)} MB)</p>}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleRunSetup} disabled={busy} className={`${buttonClass} !bg-accent !text-white hover:!bg-accent-hover border-transparent font-semibold`}>
                <Icon name="terminal" size={12} />
                Run omp setup (provider wizard)
              </button>
              <button type="button" onClick={handleCheckUpdate} disabled={busy} className={buttonClass}>
                <Icon name="restart" size={11} /> Check for updates
              </button>
              <button type="button" onClick={() => ipc.ompOpenDocs()} className={buttonClass}>
                <Icon name="external" size={11} /> Provider docs
              </button>
              <button type="button" onClick={refreshStatus} className={buttonClass} title="Re-check omp status">
                <Icon name="restart" size={11} /> Refresh
              </button>
            </div>
            {updateInfo?.latest && <p className="text-[10px] text-ink-faint">Latest release: v{updateInfo.latest}</p>}
            {status?.binaryPath && <p className="text-[10px] font-mono text-ink-faint break-all">{status.binaryPath}</p>}

            {/* Default model */}
            {modelOptions.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <label className="text-[11px] text-ink-soft whitespace-nowrap">Default model</label>
                <select
                  value={config.defaultModel || ''}
                  onChange={(e) => handleSetDefault(e.target.value)}
                  aria-label="Default model"
                  className="flex-1 bg-surface-3 border border-border rounded-lg px-2 py-1.5 text-xs text-ink-soft focus:outline-none"
                >
                  {!config.defaultModel && <option value="">— pick a model —</option>}
                  {modelOptions.map((option) => (
                    <option key={option.ref} value={option.ref}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}
            {!status?.configured && (
              <p className="text-[11px] text-warning bg-warning/10 border border-warning/25 rounded-lg px-3 py-2">
                No provider configured yet. Run <b>omp setup</b> above, or add a custom provider below.
              </p>
            )}
          </>
        )}
      </div>

      {/* Provider configuration */}
      {installed && (
        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">Providers</p>
            <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover font-semibold transition-colors">
              <Icon name={showForm ? 'minus' : 'plus'} size={11} />
              {showForm ? 'Cancel' : 'Add custom provider'}
            </button>
          </div>

          {configLoading ? (
            <p className="text-[10px] text-ink-faint">Loading…</p>
          ) : config.providers.length === 0 ? (
            <p className="text-[11px] text-ink-faint">No providers in ~/.omp/agent/models.yml yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {config.providers.map((provider) => (
                <li key={provider.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border">
                  <span className="text-[11px] font-mono font-semibold text-ink">{provider.name}</span>
                  <span className="text-[10px] font-mono text-ink-faint truncate">{provider.baseUrl}</span>
                  <span className="text-[10px] text-ink-faint shrink-0">· {provider.modelCount} model(s)</span>
                  {provider.apiKey && <span className="text-[10px] text-ink-faint shrink-0">· key {provider.apiKey}</span>}
                  <button
                    type="button"
                    onClick={() => handleDeleteProvider(provider.name)}
                    className="ml-auto text-ink-faint hover:text-danger transition-colors shrink-0"
                    title={`Delete ${provider.name}`}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showForm && (
            <div className="space-y-2.5 rounded-lg border border-border bg-surface-2 p-3.5">
              <div className="grid grid-cols-2 gap-2.5">
                <label className="text-[10px] text-ink-faint">Name
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="my-gateway" className={`${inputClass} mt-0.5 font-mono`} />
                </label>
                <label className="text-[10px] text-ink-faint">API type
                  <select value={form.api} onChange={(e) => setForm({ ...form, api: e.target.value })} className={`${inputClass} mt-0.5`}>
                    {API_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-[10px] text-ink-faint">Base URL
                <input type="text" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://my-gateway.com/v1" className={`${inputClass} mt-0.5 font-mono`} />
              </label>
              <label className="block text-[10px] text-ink-faint">API key (optional — or reference an env var name)
                <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-… or MY_GATEWAY_KEY" className={`${inputClass} mt-0.5 font-mono`} />
              </label>
              <label className="block text-[10px] text-ink-faint">Models (one per line — "id" or "id: display name")
                <textarea value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })} rows={3} placeholder={'gpt-4o-mini: GPT-4o mini\nclaude-sonnet-4.5: Sonnet 4.5'} className={`${inputClass} mt-0.5 font-mono resize-none`} />
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-[10px] text-ink-soft cursor-pointer">
                  <input type="checkbox" checked={form.authHeader} onChange={(e) => setForm({ ...form, authHeader: e.target.checked })} className="accent-accent" />
                  Inject Authorization header
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-ink-soft cursor-pointer">
                  <input type="checkbox" checked={form.disableStrictTools} onChange={(e) => setForm({ ...form, disableStrictTools: e.target.checked })} className="accent-accent" />
                  Disable strict tools
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveProvider}
                  disabled={busy || !form.name.trim() || !form.baseUrl.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? 'Saving…' : 'Save provider'}
                </button>
              </div>
            </div>
          )}

          <p className="text-[10px] text-ink-faint leading-relaxed">
            Writes to <span className="font-mono">~/.omp/agent/models.yml</span> with automatic backups. For proxies that expose both Anthropic and OpenAI endpoints, pick the matching API type per model provider.
          </p>
        </div>
      )}
    </div>
  );
}
