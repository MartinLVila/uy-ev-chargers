"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
}

const TABS: Tab[] = [
  { href: "/cerca", label: "Cerca" },
  { href: "/", label: "Mapa" },
];

function tabIsActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function PhoneTabBar() {
  const pathname = usePathname();

  return (
    <nav className="phone-tabbar" aria-label="Navegación">
      {TABS.map((tab) => {
        const active = tabIsActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="phone-tabbar-tab link-unadorned"
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
