import { formatNumber, formatPercent } from "@/lib/ui/format";
import type { RingGeometry } from "@/lib/ui/hero";

export function HeroRing({
  geometry,
  inService,
  fleet,
}: {
  geometry: RingGeometry;
  inService: number;
  fleet: number;
}) {
  const label = `${formatPercent(geometry.share)} de los conectores en servicio: ${formatNumber(inService)} de ${formatNumber(fleet)}.`;

  return (
    <div
      className="hero-ring-wrap"
      role="img"
      aria-label={label}
      style={{ "--ring-offset": geometry.offset } as React.CSSProperties}
    >
      <svg
        className="hero-ring-svg"
        width="236"
        height="236"
        viewBox="0 0 236 236"
        aria-hidden="true"
        focusable="false"
      >
        <circle className="hero-ring-track" cx="118" cy="118" r="85" fill="none" strokeWidth="14" />
        <circle className="hero-ring-inner" cx="118" cy="118" r="70" fill="none" strokeWidth="1" />
        <circle
          className="hero-ring-arc"
          cx="118"
          cy="118"
          r="85"
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={geometry.circumference}
          strokeDashoffset={geometry.offset}
          transform="rotate(-90 118 118)"
        />
      </svg>
      <div className="hero-ring-center" aria-hidden="true">
        <span className="hero-ring-percent">{formatPercent(geometry.share)}</span>
        <span className="hero-ring-caption">en servicio</span>
        <span className="hero-ring-counts">
          {formatNumber(inService)} / {formatNumber(fleet)}
        </span>
      </div>
    </div>
  );
}
