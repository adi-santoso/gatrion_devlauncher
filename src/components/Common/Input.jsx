export default function Input({ type = 'text', placeholder, value, onChange, className = '', icon, ...props }) {
  const baseClasses = 'bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent';

  if (icon) {
    return (
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">{icon}</div>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className={`${baseClasses} pl-8 ${className}`}
          {...props}
        />
      </div>
    );
  }

  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={`${baseClasses} ${className}`}
      {...props}
    />
  );
}
