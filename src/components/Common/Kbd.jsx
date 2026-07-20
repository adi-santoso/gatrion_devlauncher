export default function Kbd({ children, className = '' }) {
  return (
    <kbd className={`text-[10px] font-mono text-ink-faint border border-border rounded px-1.5 py-0.5 ${className}`}>
      {children}
    </kbd>
  );
}
