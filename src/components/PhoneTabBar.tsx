"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabIsActive, type NavTab } from "@/lib/ui/nav-tabs";

const TABS: NavTab[] = [
  { href: "/cerca", label: "Cerca" },
  { href: "/", label: "Mapa" },
  { href: "/viaje", label: "Viaje" },
];

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
