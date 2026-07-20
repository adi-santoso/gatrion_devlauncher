export default function ComponentShowcase({ onOpenModal, onShowToast }) {
  return (
    <>
      <section className="space-y-4">
        <h2 className="font-display font-bold text-base">Components</h2>
        <div className="bg-surface border border-border rounded-xl p-5 shadow-card grid grid-cols-2 gap-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-3">Buttons</p>
            <div className="flex flex-wrap items-center gap-2">
              <button className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors">
                Primary
              </button>
              <button className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink text-sm font-medium border border-border transition-colors">
                Secondary
              </button>
              <button className="px-3.5 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm font-medium transition-colors">
                Ghost
              </button>
              <button className="px-3.5 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger text-sm font-medium border border-danger/20 transition-colors">
                Destructive
              </button>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-3">Status Badges</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/20">
                <span className="w-1.5 h-1.5 rounded-full bg-success"></span>Running
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-warning/10 text-warning border border-warning/20">
                <span className="w-1.5 h-1.5 rounded-full bg-warning"></span>Starting
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-danger/10 text-danger border border-danger/20">
                <span className="w-1.5 h-1.5 rounded-full bg-danger"></span>Error
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-surface-3 text-ink-faint border border-border">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-faint"></span>Stopped
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface border border-border rounded-xl p-5 shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-3">
          Overlays (click to preview)
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onOpenModal && onOpenModal('projectModal')}
            className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors"
          >
            Add Project Modal
          </button>
          <button
            onClick={() => onOpenModal && onOpenModal('confirm')}
            className="px-3.5 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger text-sm font-medium border border-danger/20 transition-colors"
          >
            Confirm Delete
          </button>
          <button
            onClick={() => onShowToast && onShowToast('success', 'gateway-service started on :8080')}
            className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink text-sm font-medium border border-border transition-colors"
          >
            Success Toast
          </button>
          <button
            onClick={() => onShowToast && onShowToast('error', 'Port 3000 is already in use')}
            className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink text-sm font-medium border border-border transition-colors"
          >
            Error Toast
          </button>
          <button
            onClick={() => onOpenModal && onOpenModal('commandPalette')}
            className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink text-sm font-medium border border-border transition-colors"
          >
            Command Palette
          </button>
          <button
            onClick={() => onOpenModal && onOpenModal('shortcuts')}
            className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink text-sm font-medium border border-border transition-colors"
          >
            Shortcuts Sheet
          </button>
          <button
            onClick={() => onOpenModal && onOpenModal('portConflict')}
            className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink text-sm font-medium border border-border transition-colors"
          >
            Port Conflict
          </button>
        </div>
      </section>
    </>
  );
}
