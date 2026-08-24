import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cargadores eléctricos de Uruguay",
  description:
    "Mapa e historial de disponibilidad de la red pública de carga de vehículos eléctricos de UTE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-1)",
          }}
        >
          <div
            style={{
              maxWidth: 1120,
              margin: "0 auto",
              padding: "14px 24px",
              display: "flex",
              alignItems: "baseline",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/"
              style={{ fontWeight: 600, fontSize: 15, textDecoration: "none", letterSpacing: "-0.01em" }}
            >
              Cargadores eléctricos · Uruguay
            </Link>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Historial de la red pública de UTE
            </span>
          </div>
        </header>

        <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px 64px" }}>{children}</main>

        <footer
          style={{
            borderTop: "1px solid var(--border)",
            padding: "20px 24px 40px",
            fontSize: 12.5,
            color: "var(--text-muted)",
          }}
        >
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            Datos de{" "}
            <a href="https://movilidad.ute.com.uy/mapa.html" rel="noreferrer noopener" target="_blank">
              movilidad.ute.com.uy
            </a>
            . Proyecto independiente, sin relación con UTE.
          </div>
        </footer>
      </body>
    </html>
  );
}
