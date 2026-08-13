import React, { useCallback, useEffect, useState } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import Icon from '../Common/Icon';

export default function SystemEnvCard() {
  const [tools, setTools] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await ipc.checkSystemEnv();
    setLoading(false);
    if (result.success) setTools(result.tools);
    else setError(result.error || 'Failed to check environment');
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const foundCount = tools ? tools.filter((tool) => tool.found).length : 0;

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-medium">System Environment</p>
          <p className="text-[11px] text-ink-faint mt-1">Detected coding tools and versions on this machine.</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          title="Re-check tools"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <Icon name="restart" size={13} />
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      </div>

      {error && <p className="text-xs text-danger mb-3">{error}</p>}

      {tools === null && !error ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => <div key={index} className="skeleton h-12 w-full" />)}
        </div>
      ) : (
        <>
          <p className="text-[11px] text-ink-faint mb-2">
            {foundCount} of {tools?.length ?? 0} tools found
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(tools || []).map((tool) => (
              <div
                key={tool.name}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${
                  tool.found ? 'border-border bg-surface-2' : 'border-border/60 bg-surface-2/50'
                }`}
                title={tool.error || tool.name}
              >
                <span
                  className={`shrink-0 w-2 h-2 rounded-full ${tool.found ? 'bg-success' : 'bg-ink-faint/40'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink truncate">{tool.label}</p>
                  <p className="text-[10px] font-mono text-ink-faint truncate">
                    {tool.found ? (tool.version || 'found') : 'not found'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
