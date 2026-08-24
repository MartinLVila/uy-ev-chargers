import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Card({ title, description, action, children }: CardProps) {
  return (
    <section
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 20,
      }}
    >
      {(title || action) && (
        <header
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: description ? 4 : 16,
          }}
        >
          {title && (
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {description && (
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)" }}>
          {description}
        </p>
      )}
      {children}
    </section>
  );
}
