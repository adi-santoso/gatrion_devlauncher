import React, { useEffect } from 'react';
import { PRAYER_LIST } from '../../hooks/usePrayerTimes';

const Crescent = ({ size = 15, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

/** "1j 12m 34d" → "12m 34d" → "34d" → "Sekarang!" */
export const formatCountdown = (cd) => {
  if (!cd) return '';
  if (cd.totalSeconds <= 0) return 'Sekarang!';
  if (cd.hours > 0) return `${cd.hours}j ${cd.minutes}m ${cd.seconds}d`;
  if (cd.minutes > 0) return `${cd.minutes}m ${cd.seconds}d`;
  return `${cd.seconds}d`;
};

/** "01:12:34" — tabular digits so the clock does not jitter. */
const formatClock = (cd) => {
  if (!cd) return '--:--:--';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(cd.hours)}:${pad(cd.minutes)}:${pad(cd.seconds)}`;
};

const methodName = (config) => {
  const names = {
    KEMENAG: 'Kemenag RI',
    MWL: 'MWL',
    ISNA: 'ISNA',
    Egypt: 'Egypt',
    Makkah: 'Makkah',
    Karachi: 'Karachi',
  };
  return names[config?.method] || 'Kemenag RI';
};

/* ------------------------------------------------------------------ */
/* Sidebar card (expanded) — Design A                                  */
/* ------------------------------------------------------------------ */
export function PrayerCard({ data, config, onExpand }) {
  if (!data) return null;
  const nextIdx = data.today.findIndex((p) => p.key === data.next.key);
  const countText = formatCountdown(data.countdown);

  return (
    <button
      type="button"
      onClick={onExpand}
      title={`${data.next.label} ${data.next.formatted} — klik untuk jadwal lengkap`}
      className="w-full text-left rounded-xl p-3 cursor-pointer border border-accent/30 bg-gradient-to-br from-accent-soft/70 to-surface transition-colors hover:border-accent"
    >
      <span className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-lg bg-accent text-white flex items-center justify-center shadow-glow shrink-0">
          <Crescent size={13} />
        </span>
        <span className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-ink-soft">Pengingat Sholat</span>
          <span className="block font-mono text-[8px] text-ink-faint">{config?.city || 'Jakarta'} · {methodName(config)}</span>
        </span>
      </span>
      <span className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-[15px] font-extrabold">{data.next.label}</span>
        <span className="font-mono text-[15px] font-bold text-accent-hover">{data.next.formatted}</span>
        <span className={`ml-auto font-mono text-[10px] px-2 py-0.5 rounded-full border ${data.near ? 'text-danger bg-danger-soft border-danger/25' : 'text-warning bg-warning-soft border-warning/25'}`}>
          {countText}
        </span>
      </span>
      <span className="mt-2.5 flex gap-1">
        {data.today.map((p, i) => (
          <span
            key={p.key}
            className={`h-[3px] flex-1 rounded-full ${i < nextIdx ? 'bg-accent opacity-35' : i === nextIdx ? 'bg-accent shadow-[0_0_8px_rgba(109,94,245,0.7)]' : 'bg-accent/25'}`}
          />
        ))}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar icon (collapsed)                                            */
/* ------------------------------------------------------------------ */
export function PrayerIcon({ data, onExpand }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={data ? `${data.next.label} ${data.next.formatted} — ${formatCountdown(data.countdown)}` : 'Pengingat Sholat'}
      className="w-full flex justify-center py-2 rounded-lg cursor-pointer border border-accent/35 bg-accent-soft text-accent hover:border-accent transition-colors relative"
    >
      <Crescent size={15} />
      {data?.near && <span className="absolute top-1 right-3.5 w-1.5 h-1.5 rounded-full bg-warning pulse-dot" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Topbar pill                                                         */
/* ------------------------------------------------------------------ */
export function PrayerPill({ data, onExpand }) {
  if (!data) return null;
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`${data.next.label} ${data.next.formatted} — ${formatCountdown(data.countdown)} · klik untuk jadwal lengkap`}
      className="flex items-center gap-1.5 h-7 rounded-lg border border-border bg-surface px-2.5 text-[10px] hover:border-accent hover:bg-accent-soft transition-colors cursor-pointer"
    >
      <span className="w-5 h-5 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
        <Crescent size={11} />
      </span>
      <span className="font-bold">{data.next.label}</span>
      <span className="font-mono text-ink-soft">{data.next.formatted}</span>
      <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-full ${data.near ? 'text-danger bg-danger-soft' : 'text-warning bg-warning-soft'}`}>
        {formatCountdown(data.countdown)}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Floating expanded panel                                             */
/* ------------------------------------------------------------------ */
export function PrayerPanel({ open, data, config, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !data) return null;
  const nextIdx = data.today.findIndex((p) => p.key === data.next.key);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px] animate-backdrop-in" onClick={onClose} />
      <div className="relative w-[440px] max-w-[calc(100vw-40px)] rounded-2xl overflow-hidden border border-accent/35 bg-surface shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)] animate-panel-in">
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="absolute top-3 right-3 z-10 w-6 h-6 rounded-lg border border-border bg-surface text-ink-soft hover:text-ink cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mx-auto"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>

        <div className="bg-gradient-to-br from-accent-soft/80 to-surface px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center shadow-glow">
              <Crescent size={17} />
            </span>
            <span>
              <span className="block text-xs font-bold">Pengingat Sholat</span>
              <span className="block font-mono text-[9px] text-ink-faint">
                {config?.city || 'Jakarta'} · {methodName(config)} · GMT{config?.utcOffset != null && config.utcOffset >= 0 ? '+' : ''}{config?.utcOffset}
              </span>
            </span>
          </div>
          <div className="mt-3.5 flex items-baseline gap-3">
            <span className="font-display text-lg font-extrabold">{data.next.label}</span>
            <span className="font-mono text-[30px] font-bold text-accent-hover tracking-tight">{data.next.formatted}</span>
            <span className="ml-auto text-right">
              <span className="block font-mono text-2xl font-bold text-warning tabular-nums">{formatClock(data.countdown)}</span>
              <span className="block text-[8px] uppercase tracking-[0.1em] text-ink-faint font-mono">menuju {data.next.label}</span>
            </span>
          </div>
        </div>

        <div className="px-6 py-2.5">
          {data.today.map((p, i) => {
            const isNext = i === nextIdx;
            return (
              <div key={p.key} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs ${isNext ? 'bg-accent-soft' : i < nextIdx ? 'opacity-45' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isNext ? 'bg-accent shadow-[0_0_6px_var(--color-accent)]' : 'bg-surface-3'}`} />
                <span className="flex-1 font-semibold">{p.label}</span>
                <span className={`font-mono text-[11px] text-ink-soft ${isNext ? 'text-accent-hover font-bold' : ''}`}>{p.formatted}</span>
                {isNext && <span className="text-[8px] font-extrabold tracking-wider text-accent">● SEKARANG</span>}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-6 py-3 font-mono text-[9px] text-ink-faint border-t border-border">
          <span>{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span>{methodName(config)}</span>
        </div>
      </div>
    </div>
  );
}

export { PRAYER_LIST, Crescent };
