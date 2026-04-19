interface Props {
  className?: string;
  size?: number;
}

export default function LogoSolarPanel({ className = "", size = 40 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      {/* Sun rays */}
      <g stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round">
        <line x1="49" y1="8" x2="49" y2="14" />
        <line x1="57" y1="14" x2="53" y2="18" />
        <line x1="59" y1="22" x2="54" y2="22" />
      </g>

      {/* Sun */}
      <circle cx="49" cy="22" r="6" fill="#fbbf24" />
      <circle cx="49" cy="22" r="3.5" fill="#f59e0b" />

      {/* Solar panel frame — dark navy */}
      <rect x="4" y="22" width="46" height="34" rx="2" fill="#1e3a8a" />

      {/* Panel cells — blue tones with teal accents */}
      <g>
        {/* Row 1 */}
        <rect x="6" y="24" width="10" height="9" fill="#3b82f6" />
        <rect x="17" y="24" width="10" height="9" fill="#2563eb" />
        <rect x="28" y="24" width="10" height="9" fill="#1ed0c7" />
        <rect x="39" y="24" width="9" height="9" fill="#3b82f6" />

        {/* Row 2 */}
        <rect x="6" y="34" width="10" height="9" fill="#2563eb" />
        <rect x="17" y="34" width="10" height="9" fill="#1ed0c7" />
        <rect x="28" y="34" width="10" height="9" fill="#3b82f6" />
        <rect x="39" y="34" width="9" height="9" fill="#2563eb" />

        {/* Row 3 */}
        <rect x="6" y="44" width="10" height="10" fill="#1ed0c7" />
        <rect x="17" y="44" width="10" height="10" fill="#3b82f6" />
        <rect x="28" y="44" width="10" height="10" fill="#2563eb" />
        <rect x="39" y="44" width="9" height="10" fill="#1ed0c7" />
      </g>

      {/* Panel glare highlight */}
      <polygon points="4,22 14,22 4,32" fill="white" opacity="0.15" />

      {/* Stand */}
      <rect x="24" y="56" width="6" height="5" fill="#64748b" />
      <rect x="18" y="60" width="18" height="2" rx="1" fill="#475569" />

      {/* Green leaf accent — bottom right */}
      <path d="M 54 48 Q 58 44, 60 48 Q 58 52, 54 50 Z" fill="#10b981" />
    </svg>
  );
}
