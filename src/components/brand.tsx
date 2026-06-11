/* Circuit Core brand mark (assets/brand/circuit-core-mark.svg), inlined so it
   renders crisply at any size without an extra request. */

export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Helix Studio"
    >
      <defs>
        <linearGradient id="hx-frame" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00ffd1" />
          <stop offset="0.48" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#c084fc" />
        </linearGradient>
        <linearGradient id="hx-h" x1="21" y1="18" x2="43" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#a7f3d0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#070b12" />
      <rect x="9" y="9" width="46" height="46" rx="11" fill="#0d1626" stroke="url(#hx-frame)" strokeWidth="3" />
      <path d="M22 20v24M42 20v24M22 32h20" fill="none" stroke="url(#hx-h)" strokeWidth="5" strokeLinecap="round" />
      <path
        d="M22 25h-7M42 39h7M32 32V20h6M32 32v12h-6"
        fill="none"
        stroke="#00ffd1"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g fill="#f8fbff">
        <circle cx="15" cy="25" r="2" />
        <circle cx="49" cy="39" r="2" />
        <circle cx="38" cy="20" r="1.8" />
        <circle cx="26" cy="44" r="1.8" />
      </g>
    </svg>
  );
}

/** The double-helix glyph used for AI/agent avatars. */
export function HelixGlyph({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="2.4"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M7 4c0 4 10 4 10 8s-10 4-10 8" />
      <path d="M17 4c0 4-10 4-10 8s10 4 10 8" />
    </svg>
  );
}

/** Decorative circuit traces drawn in the mark's visual language — used as a
 * low-opacity backdrop in heroes and empty states. Inherits currentColor. */
export function CircuitTraces({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 200"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M0 40h90l24 24h70" />
      <path d="M60 200V140l30-30h80V60l24-24h80" />
      <path d="M210 200v-44l28-28h70l22-22V0" />
      <path d="M300 140h60l30 30h30" />
      <path d="M340 40h44l36 36" />
      <g fill="currentColor" stroke="none">
        <circle cx="114" cy="64" r="3.5" />
        <circle cx="184" cy="64" r="3.5" />
        <circle cx="274" cy="36" r="3.5" />
        <circle cx="238" cy="128" r="3.5" />
        <circle cx="330" cy="68" r="3.5" />
        <circle cx="360" cy="140" r="3.5" />
      </g>
    </svg>
  );
}
