import { useState } from 'react';

export default function ResourceChart({ data, timeRange = '1H' }) {
  const [activeRange, setActiveRange] = useState(timeRange);

  const cpuPath = data?.cpu || "M0,140 L40,130 L80,135 L120,120 L160,128 L200,110 L240,118 L280,100 L320,112 L360,95 L400,105 L440,88 L480,96";
  const memPath = data?.memory || "M0,110 L40,100 L80,105 L120,80 L160,90 L200,60 L240,75 L280,55 L320,68 L360,45 L400,58 L440,40 L480,48";

  return (
    <div className="col-span-2 bg-surface border border-border rounded-xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-bold text-sm">Resource Usage</h3>
          <p className="text-xs text-ink-faint mt-0.5">Last 60 minutes</p>
        </div>
        <div className="flex gap-1 bg-surface-3 rounded-lg p-0.5">
          {['1H', '6H', '24H'].map((range) => (
            <button
              key={range}
              onClick={() => setActiveRange(range)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                activeRange === range
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-faint hover:text-ink'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 480 160" className="w-full h-40">
        <defs>
          <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6D5EF5" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#6D5EF5" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="#232830" strokeWidth="1">
          <line x1="0" y1="20" x2="480" y2="20" />
          <line x1="0" y1="60" x2="480" y2="60" />
          <line x1="0" y1="100" x2="480" y2="100" />
          <line x1="0" y1="140" x2="480" y2="140" />
        </g>
        <path d={`${memPath} L480,160 L0,160 Z`} fill="url(#memGrad)" />
        <path d={memPath} fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={`${cpuPath} L480,160 L0,160 Z`} fill="url(#cpuGrad)" />
        <path d={cpuPath} fill="none" stroke="#6D5EF5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="w-2 h-2 rounded-full bg-accent inline-block"></span>CPU
        </span>
        <span className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="w-2 h-2 rounded-full bg-success inline-block"></span>Memory
        </span>
      </div>
    </div>
  );
}
