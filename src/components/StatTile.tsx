interface StatTileProps {
  label: string;
  value: string;
  note?: string;
  accent?: string;
  emphasis?: boolean;
}

export function StatTile({ label, value, note, accent, emphasis = false }: StatTileProps) {
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: emphasis ? 40 : 28,
          fontWeight: 600,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          color: accent ?? "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      {note && (
        <span style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.4 }}>{note}</span>
      )}
    </div>
  );
}
