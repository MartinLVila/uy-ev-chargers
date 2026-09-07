"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
}

const TABS: Tab[] = [{ href: "/", label: "Red" }];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Secciones">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="app-nav-tab link-unadorned"
            data-active={active || undefined}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
