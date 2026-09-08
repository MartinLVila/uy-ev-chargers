export interface NavTab {
  href: string;
  label: string;
}

export function tabIsActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
