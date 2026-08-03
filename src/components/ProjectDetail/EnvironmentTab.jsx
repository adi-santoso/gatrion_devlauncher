import React from 'react';

export default function EnvironmentTab({ envVars = [], onEdit }) {
  const variables = Array.isArray(envVars) ? envVars : [];
  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div><p className="text-sm font-medium">Environment Variables</p><p className="text-[11px] text-ink-faint mt-1">Read-only project configuration.</p></div>
        <button onClick={onEdit} className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium transition-colors">Edit Project</button>
      </div>
      {variables.length === 0 ? <p className="py-6 text-center text-sm text-ink-faint">No environment variables configured.</p>
        : <dl className="divide-y divide-border">{variables.map((envVar, index) => <div key={`${envVar?.key || 'variable'}-${index}`} className="grid grid-cols-3 gap-4 py-3 text-xs font-mono">
          <dt className="text-ink-soft break-all">{envVar?.key || '(unnamed)'}</dt><dd className="col-span-2 text-ink break-all">{envVar?.secret ? 'Stored securely' : (envVar?.value == null ? '' : String(envVar.value))}</dd>
        </div>)}</dl>}
    </div>
  );
}
