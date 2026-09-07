import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadLastSuccessfulPollAt } from "@/lib/metrics/header";
import { formatElapsed } from "@/lib/ui/format";

export async function AppHeader() {
  const lastSuccessfulPollAt = await loadLastSuccessfulPollAt();
  const hasReading = lastSuccessfulPollAt !== null;

  return (
    <header className="app-header">
      <div className="container app-header-inner">
        <Link href="/" className="link-unadorned brand">
          <svg
            className="brand-mark"
            width="22"
            height="26"
            viewBox="0 0 22 26"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="7" y="0" width="8" height="2.5" rx="1" fill="currentColor" />
            <rect
              x="1"
              y="2.5"
              width="20"
              height="22.5"
              rx="3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <rect className="brand-mark-bar brand-mark-bar-top" x="4.5" y="6" width="13" height="3.5" rx="1" />
            <rect className="brand-mark-bar brand-mark-bar-mid" x="4.5" y="11" width="13" height="3.5" rx="1" />
            <rect
              className="brand-mark-bar brand-mark-bar-bottom"
              x="4.5"
              y="16"
              width="13"
              height="3.5"
              rx="1"
            />
          </svg>
          <span className="brand-text">
            <span className="brand-title">Carga · Uruguay</span>
            <span className="brand-subtitle">Red pública de UTE · telemetría</span>
          </span>
        </Link>

        <AppNav />

        <div className="app-header-status">
          <span className="live-indicator">
            <span className="live-dot" data-live={hasReading || undefined} aria-hidden="true" />
            {hasReading ? `Última lectura ${formatElapsed(lastSuccessfulPollAt)}` : "Sin lecturas recientes"}
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
