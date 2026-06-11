/* Tiny brand logos used on project cards and dependency lists. */

export function TsLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="TypeScript">
      <rect width="24" height="24" rx="4" fill="#3178c6" />
      <text x="12" y="17" fontFamily="Arial" fontWeight="700" fontSize="11" fill="#fff" textAnchor="middle">
        TS
      </text>
    </svg>
  );
}

export function NextLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Next.js">
      <circle cx="12" cy="12" r="12" fill="#000" />
      <path d="M9 7v10M9 7l8.5 11" stroke="#fff" strokeWidth="1.4" fill="none" />
      <path d="M16 7v6" stroke="#fff" strokeWidth="1.4" />
    </svg>
  );
}

export function ReactLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-11.5 -10.23 23 20.46" aria-label="React">
      <circle r="2.05" fill="#61dafb" />
      <g stroke="#61dafb" strokeWidth="1" fill="none">
        <ellipse rx="11" ry="4.2" />
        <ellipse rx="11" ry="4.2" transform="rotate(60)" />
        <ellipse rx="11" ry="4.2" transform="rotate(120)" />
      </g>
    </svg>
  );
}

export function NodeLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Node.js">
      <path d="M12 1.6 2.9 6.9v10.2L12 22.4l9.1-5.3V6.9z" fill="#5fa04e" />
      <text x="12" y="15.5" fontFamily="Arial" fontWeight="700" fontSize="6.5" fill="#fff" textAnchor="middle">
        node
      </text>
    </svg>
  );
}

export function PrismaLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Prisma">
      <path d="M4.5 17.3 12 2.5l7 17-9.5 4z" stroke="#5b8cff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function ProjectLogos({ language }: { language: string }) {
  if (language === "React") return <ReactLogo />;
  if (language === "Node") return <NodeLogo />;
  return (
    <span className="flex items-center gap-1">
      <TsLogo />
      <NextLogo />
    </span>
  );
}
