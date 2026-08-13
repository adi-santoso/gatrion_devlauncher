import React, { useCallback, useEffect, useState } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import Icon from '../Common/Icon';
import { ConfirmDialog } from '../Modals';

// Keys whose values are treated as secrets (masked until revealed).
const SECRET_KEY = /(SECRET|TOKEN|PASSWORD|PASSWD|PASS|API_KEY|PRIVATE|KEY)/i;

function maskValue(key, value) {
  if (!SECRET_KEY.test(key) || !value) return value;
  const visible = Math.min(value.length, 4);
  return `${'•'.repeat(Math.max(4, visible))} (${value.length} chars)`;
}

function highlightLine(line, revealSecrets) {
  const trimmed = line.trim();
  if (!trimmed) return <span className="text-ink-faint">&nbsp;</span>;
  if (trimmed.startsWith('#')) return <span className="text-ink-faint italic">{line}</span>;
  const eqIndex = line.indexOf('=');
  if (eqIndex === -1) return <span className="text-ink">{line}</span>;
  const key = line.slice(0, eqIndex);
  const value = line.slice(eqIndex + 1);
  const displayed = revealSecrets ? value : maskValue(key, value);
  return (
    <>
      <span className="text-accent">{key}</span>
      <span className="text-ink-faint">=</span>
      <span className="text-success">{displayed}</span>
    </>
  );
}

// Common environment profiles shown as quick-switch chips.
const PROFILE_FILES = ['.env', '.env.dev', '.env.staging', '.env.production'];

function EnvFileSection({ projectPath }) {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [pendingSwitch, setPendingSwitch] = useState(null);
  const [revealSecrets, setRevealSecrets] = useState(false);

  const loadFile = useCallback(async (fileName) => {
    if (!fileName) return;
    setLoading(true);
    setLoadError(null);
    const result = await ipc.readEnvFile(projectPath, fileName);
    setLoading(false);
    if (result.success) {
      setContent(result.content);
      setSavedContent(result.content);
      setEditing(false);
    } else {
      setLoadError(result.error || 'Failed to read file');
      setContent('');
      setSavedContent('');
    }
  }, [projectPath]);

  const refreshFiles = useCallback(async () => {
    const result = await ipc.listEnvFiles(projectPath);
    if (result.success) {
      setFiles(result.files);
      setSelectedFile((current) => (current && result.files.includes(current) ? current : result.files[0] || ''));
    } else {
      setLoadError(result.error || 'Failed to list env files');
    }
  }, [projectPath]);

  useEffect(() => {
    setFiles([]);
    setSelectedFile('');
    setContent('');
    setSavedContent('');
    setNotice(null);
    setLoadError(null);
    refreshFiles();
  }, [refreshFiles]);

  useEffect(() => {
    if (selectedFile) loadFile(selectedFile);
  }, [selectedFile, loadFile]);

  const dirty = content !== savedContent;

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    const result = await ipc.writeEnvFile(projectPath, selectedFile, content);
    setSaving(false);
    if (result.success) {
      setSavedContent(content);
      setEditing(false);
      setNotice({ type: 'success', message: `${selectedFile} saved (backup created).` });
    } else {
      setNotice({ type: 'error', message: result.error || 'Failed to save file' });
    }
  };

  const handleSelectFile = (fileName) => {
    if (dirty) {
      setPendingSwitch(fileName);
      return;
    }
    setNotice(null);
    setSelectedFile(fileName);
  };

  const confirmSwitch = () => {
    setNotice(null);
    setSelectedFile(pendingSwitch);
    setPendingSwitch(null);
  };

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-sm font-medium">Project .env files</p>
          <p className="text-[11px] text-ink-faint mt-1">Loaded directly from the project folder. Saving creates a timestamped backup.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-ink-faint cursor-pointer select-none">
            <input
              type="checkbox"
              checked={revealSecrets}
              onChange={(e) => setRevealSecrets(e.target.checked)}
              className="w-3 h-3 accent-accent"
            />
            Reveal secrets
          </label>
          <select
            value={selectedFile}
            onChange={(event) => handleSelectFile(event.target.value)}
            aria-label="Select env file"
            className="bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {files.map((file) => <option key={file} value={file}>{file}</option>)}
          </select>
          <button
            onClick={refreshFiles}
            title="Reload file list"
            aria-label="Reload env file list"
            className="p-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink transition-colors"
          >
            <Icon name="restart" size={13} />
          </button>
        </div>
      </div>

      {loadError && <p className="text-xs text-danger mb-3">{loadError}</p>}
      {notice && (
        <p className={`text-xs mb-3 ${notice.type === 'success' ? 'text-success' : 'text-danger'}`}>{notice.message}</p>
      )}

      {PROFILE_FILES.some((file) => files.includes(file)) && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-faint mr-1">Profile:</span>
          {PROFILE_FILES.map((file) => (
            <button
              key={file}
              type="button"
              onClick={() => handleSelectFile(file)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-mono border transition-colors cursor-pointer ${
                selectedFile === file
                  ? 'text-accent border-accent/40 bg-accent/10'
                  : files.includes(file)
                    ? 'text-ink-soft border-border bg-surface-2 hover:bg-surface-3'
                    : 'text-ink-faint/50 border-border/40 opacity-60 cursor-not-allowed'
              }`}
              title={files.includes(file) ? `Switch to ${file}` : `${file} not present in this project`}
            >
              {file === '.env' ? 'base' : file.replace('.env.', '')}
            </button>
          ))}
        </div>
      )}

      {files.length === 0 && !loadError ? (
        <p className="py-6 text-center text-sm text-ink-faint">No .env files found in this project.</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-ink-faint">
              {selectedFile}{dirty ? ' • modified' : ''}
            </span>
            <div className="flex items-center gap-2">
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  disabled={loading || !selectedFile}
                  className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  Edit
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { setContent(savedContent); setEditing(false); }}
                    className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>

          {editing ? (
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              spellCheck={false}
              aria-label={`Edit ${selectedFile}`}
              className="w-full h-72 bg-base border border-border rounded-lg p-3 text-xs font-mono text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
            />
          ) : (
            <pre
              aria-label={`Content of ${selectedFile}`}
              className="w-full max-h-72 overflow-auto bg-base border border-border rounded-lg p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all"
            >
              {loading ? 'Loading...' : content.split('\n').map((line, index) => (
                <div key={index}>{highlightLine(line, revealSecrets)}</div>
              ))}
            </pre>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={pendingSwitch !== null}
        title="Discard Changes"
        message={`Discard unsaved changes to ${selectedFile}? This cannot be undone.`}
        confirmLabel="Discard"
        confirmVariant="danger"
        onConfirm={confirmSwitch}
        onCancel={() => setPendingSwitch(null)}
      />
    </div>
  );
}

export default function EnvironmentTab({ project, envVars = [], onEdit }) {
  const variables = Array.isArray(envVars) ? envVars : [];
  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div><p className="text-sm font-medium">Launcher Environment Variables</p><p className="text-[11px] text-ink-faint mt-1">Variables injected by Gatrion when starting this project.</p></div>
          <button onClick={onEdit} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium transition-colors"><Icon name="gear" size={13} /> Edit Project</button>
        </div>
        {variables.length === 0 ? <p className="py-6 text-center text-sm text-ink-faint">No environment variables configured.</p>
          : <dl className="divide-y divide-border">{variables.map((envVar, index) => <div key={`${envVar?.key || 'variable'}-${index}`} className="grid grid-cols-3 gap-4 py-3 text-xs font-mono">
            <dt className="text-ink-soft break-all">{envVar?.key || '(unnamed)'}</dt><dd className="col-span-2 text-ink break-all">{envVar?.secret ? 'Stored securely' : (envVar?.value == null ? '' : String(envVar.value))}</dd>
          </div>)}</dl>}
      </div>

      {project?.path && <EnvFileSection projectPath={project.path} />}
    </div>
  );
}
