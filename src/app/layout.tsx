import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const sans = Instrument_Sans({ subsets: ["latin"], display: "swap", variable: "--font-body" });

export const metadata: Metadata = {
  title: "Cargadores eléctricos de Uruguay",
  description:
    "Mapa e historial de disponibilidad de la red pública de carga de vehículos eléctricos de UTE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={sans.variable} suppressHydrationWarning>
      <body>
        <script src="/theme.js" />
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-page)",
          }}
        >
          <div
            className="container"
            style={{
              paddingTop: 14,
              paddingBottom: 14,
              display: "flex",
              alignItems: "center",
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
            <ThemeToggle />
          </div>
        </header>

        <main>{children}</main>

        <footer
          style={{
            borderTop: "1px solid var(--border)",
            padding: "20px 0 40px",
            fontSize: 12.5,
            color: "var(--text-muted)",
          }}
        >
          <div className="container">
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
