import type { Metadata } from "next";
import { Chivo } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
import { PhoneTabBar } from "@/components/PhoneTabBar";
import "./globals.css";

const sans = Chivo({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "800", "900"],
  display: "swap",
  variable: "--font-body",
});

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
        <AppHeader />

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

        <PhoneTabBar />
      </body>
    </html>
  );
}
