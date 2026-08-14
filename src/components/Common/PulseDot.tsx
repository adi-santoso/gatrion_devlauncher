interface PulseDotProps {
  color?: string
  size?: string
}

export default function PulseDot({ color = 'currentColor', size = 'w-2 h-2' }: PulseDotProps) {
  return (
    <span className={`relative flex items-center justify-center ${size} shrink-0`} style={{ color }}>
      <span className="pulse-dot"></span>
      <span className={`relative ${size} rounded-full`} style={{ backgroundColor: color }}></span>
    </span>
  );
}
