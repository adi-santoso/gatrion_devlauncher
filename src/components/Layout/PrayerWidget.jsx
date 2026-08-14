import React, { useEffect, useState } from 'react';
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
const formatClock = (date) => {
  if (!date) return '--:--:--';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** "Jumat, 14 Agu 2026" — Indonesian Gregorian date. */
const formatGregorian = (date) => {
  if (!date) return '';
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
};

/** "1 Shafar 1448 H" — Hijri date via the built-in Umm al-Qura calendar. */
const hijriFormatter = new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
export const formatHijri = (date) => {
  if (!date) return '';
  return hijriFormatter.format(date);
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

/**
 * RotatingSlide — stacks `slides` vertically in a fixed-height window and
 * advances every `interval` ms with a slide up/down transition. All slides
 * must share the same height (the container height), which keeps the widget
 * from jumping as content changes.
 */
function RotatingSlide({ slides, interval = 5000, duration = 300, heightClass = '', className = '' }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), interval);
    return () => clearInterval(timer);
  }, [slides.length, interval]);

  return (
    <div className={`relative overflow-hidden ${heightClass} ${className}`}>
      <div
        className="h-full flex flex-col transition-transform ease-in-out"
        style={{ transform: `translateY(-${index * 100}%)`, transitionDuration: `${duration}ms` }}
        data-slide-index={index}
      >
        {slides.map((slide, i) => (
          <div key={i} className="h-full flex-none">{slide}</div>
        ))}
      </div>
    </div>
  );
}

/** Compact countdown badge — neutral (theme-safe) or danger when the prayer is near. */
const countBadge = (data) => {
  const cls = data.near
    ? 'text-danger bg-danger/10 border-danger/25'
    : 'text-ink-soft bg-surface-3 border-border';
  return (
    <span className={`inline-flex items-center font-mono text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>
      {formatCountdown(data.countdown)}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Sidebar card (expanded) — two rotating slides: clock/dates, then   */
/* the incoming prayer + countdown. Replaced by an "ongoing" slide    */
/* while a prayer is within its 10-minute window.                     */
/* ------------------------------------------------------------------ */
export function PrayerCard({ data, config, onExpand }) {
  if (!data) return null;
  const nextIdx = data.today.findIndex((p) => p.key === data.next.key);
  const inProgress = data.inProgress;

  const clockSlide = (
    <div className="h-full flex flex-col justify-center gap-0.5">
      <span className="flex items-center gap-2">
        <span className="font-mono text-lg font-bold tabular-nums tracking-tight text-ink">{formatClock(data.now)}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-accent pulse-dot" />
      </span>
      <span className="text-[9px] text-ink-faint truncate">{formatGregorian(data.now)}</span>
      <span className="text-[9px] text-ink-soft font-medium truncate">{formatHijri(data.now)}</span>
    </div>
  );

  const incomingSlide = (
    <div className="h-full flex flex-col justify-center gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="font-display text-sm font-extrabold text-ink">{data.next.label}</span>
        <span className="font-mono text-sm font-bold text-accent">{data.next.formatted}</span>
      </span>
      <span className="self-start">{countBadge(data)}</span>
    </div>
  );

  const ongoingSlide = inProgress ? (
    <div className="h-full flex flex-col justify-center gap-1">
      <span className="flex items-center gap-1.5 text-danger">
        <span className="w-1.5 h-1.5 rounded-full bg-danger pulse-dot" />
        <span className="text-[9px] font-bold uppercase tracking-[0.12em]">Sedang Berlangsung</span>
      </span>
      <span className="font-display text-sm font-extrabold text-ink">Sholat {inProgress.label}</span>
    </div>
  ) : null;

  const slides = inProgress ? [clockSlide, ongoingSlide] : [clockSlide, incomingSlide];

  return (
    <button
      type="button"
      onClick={onExpand}
      title={`${data.next.label} ${data.next.formatted} — klik untuk jadwal lengkap`}
      className="w-full text-left rounded-xl p-3 cursor-pointer border border-accent/30 bg-surface transition-colors hover:border-accent"
    >
      <span className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-lg bg-accent text-white flex items-center justify-center shadow-glow shrink-0">
          <Crescent size={13} />
        </span>
        <span className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-ink-soft">Pengingat Sholat</span>
          <span className="block font-mono text-[8px] text-ink-faint truncate">{config?.city || 'Jakarta'} · {methodName(config)}</span>
        </span>
      </span>
      <span className="mt-2 block">
        <RotatingSlide slides={slides} heightClass="h-[60px]" />
      </span>
      <span className="mt-2 flex gap-1">
        {data.today.map((p, i) => (
          <span
            key={p.key}
            className={`h-[3px] flex-1 rounded-full ${i < nextIdx ? 'bg-accent/35' : i === nextIdx ? 'bg-accent shadow-[0_0_8px_rgba(109,94,245,0.7)]' : 'bg-accent/15'}`}
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
      className="w-full flex justify-center py-2 rounded-lg cursor-pointer border border-accent/35 bg-accent/10 text-accent hover:border-accent transition-colors relative"
    >
      <Crescent size={15} />
      {data?.near && <span className="absolute top-1 right-3.5 w-1.5 h-1.5 rounded-full bg-warning pulse-dot" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Topbar pill — two rotating slides: clock, then incoming prayer.     */
/* ------------------------------------------------------------------ */
export function PrayerPill({ data, onExpand }) {
  if (!data) return null;
  const inProgress = data.inProgress;

  const clockSlide = (
    <span className="h-full flex items-center gap-1.5">
      <span className="font-mono tabular-nums font-semibold text-ink">{formatClock(data.now)}</span>
      <span className="w-1 h-1 rounded-full bg-accent pulse-dot" />
    </span>
  );

  const incomingSlide = (
    <span className="h-full flex items-center gap-1.5">
      <span className="w-5 h-5 rounded-md bg-accent/10 text-accent flex items-center justify-center shrink-0">
        <Crescent size={11} />
      </span>
      <span className="font-bold text-ink">{data.next.label}</span>
      <span className="font-mono text-ink-soft">{data.next.formatted}</span>
      {countBadge(data)}
    </span>
  );

  const ongoingSlide = inProgress ? (
    <span className="h-full flex items-center gap-1.5 text-danger">
      <Crescent size={11} />
      <span className="w-1 h-1 rounded-full bg-danger pulse-dot" />
      <span className="font-bold">Sedang {inProgress.label}</span>
    </span>
  ) : null;

  const slides = inProgress ? [clockSlide, ongoingSlide] : [clockSlide, incomingSlide];

  return (
    <button
      type="button"
      onClick={onExpand}
      title={`${data.next.label} ${data.next.formatted} — ${formatCountdown(data.countdown)} · klik untuk jadwal lengkap`}
      className="flex items-center h-7 rounded-lg border border-border bg-surface px-2.5 text-[10px] hover:border-accent hover:bg-accent/5 transition-colors cursor-pointer"
    >
      <RotatingSlide slides={slides} heightClass="h-7" interval={5000} duration={300} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Floating expanded panel — static (no rotation); everything at once  */
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
  const inProgress = data.inProgress;

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

        <div className="bg-accent/5 px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center shadow-glow">
              <Crescent size={17} />
            </span>
            <span>
              <span className="block text-xs font-bold text-ink">Pengingat Sholat</span>
              <span className="block font-mono text-[9px] text-ink-faint">
                {config?.city || 'Jakarta'} · {methodName(config)} · GMT{config?.utcOffset != null && config.utcOffset >= 0 ? '+' : ''}{config?.utcOffset}
              </span>
            </span>
          </div>
          <div className="mt-3.5 flex items-baseline gap-3">
            <span className="font-mono text-[34px] font-bold tabular-nums tracking-tight text-ink">{formatClock(data.now)}</span>
            <span className="ml-auto text-right">
              <span className="block text-[11px] font-medium text-ink-soft">{formatGregorian(data.now)}</span>
              <span className="block font-mono text-[11px] text-accent">{formatHijri(data.now)}</span>
            </span>
          </div>
          {inProgress ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-danger pulse-dot shrink-0" />
              <span className="text-[11px] font-bold text-danger">Sedang Berlangsung Sholat {inProgress.label}</span>
            </div>
          ) : (
            <div className="mt-3 flex items-baseline gap-3">
              <span className="font-display text-sm font-extrabold text-ink">Menuju {data.next.label}</span>
              <span className="font-mono text-xl font-bold text-accent tracking-tight">{data.next.formatted}</span>
              <span className="ml-auto">{countBadge(data)}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-2.5">
          {data.today.map((p, i) => {
            const isNext = i === nextIdx;
            const isOngoing = inProgress?.key === p.key;
            const dimBefore = inProgress ? nextIdx - 1 : nextIdx;
            return (
              <div key={p.key} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs ${isOngoing ? 'bg-danger/10' : isNext && !inProgress ? 'bg-accent/10' : i < dimBefore ? 'opacity-45' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isOngoing ? 'bg-danger shadow-[0_0_6px_var(--color-danger)]' : isNext && !inProgress ? 'bg-accent shadow-[0_0_6px_var(--color-accent)]' : 'bg-surface-3'}`} />
                <span className="flex-1 font-semibold text-ink">{p.label}</span>
                <span className={`font-mono text-[11px] text-ink-soft ${isOngoing ? 'text-danger font-bold' : isNext ? 'text-accent font-bold' : ''}`}>{p.formatted}</span>
                {isOngoing && <span className="text-[8px] font-extrabold tracking-wider text-danger">● BERLANGSUNG</span>}
                {!inProgress && isNext && <span className="text-[8px] font-extrabold tracking-wider text-accent">● SEKARANG</span>}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-6 py-3 font-mono text-[9px] text-ink-faint border-t border-border">
          <span>{formatGregorian(data.now)}</span>
          <span>{methodName(config)}</span>
        </div>
      </div>
    </div>
  );
}

export { PRAYER_LIST, Crescent };
