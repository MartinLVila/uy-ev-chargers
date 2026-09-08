"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabIsActive, type NavTab } from "@/lib/ui/nav-tabs";

const TABS: NavTab[] = [
  { href: "/", label: "Red" },
  { href: "/estaciones", label: "Estaciones" },
  { href: "/cerca", label: "Cerca" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Secciones">
      {TABS.map((tab) => {
        const active = tabIsActive(pathname, tab.href);
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
