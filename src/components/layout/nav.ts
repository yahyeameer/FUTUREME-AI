import { BookOpenText, CircleDot, Home, Library, Newspaper, Route, Settings, Sparkles } from "lucide-react";

export const NAV = [
  { href: "/", label: "Home", icon: Home, shortcut: "G H" },
  { href: "/future-self", label: "Future Self", icon: CircleDot, shortcut: "G F" },
  { href: "/memory", label: "Memory Vault", icon: Library, shortcut: "G M" },
  { href: "/roadmap", label: "Life Roadmap", icon: Route, shortcut: "G R" },
  { href: "/daily", label: "FutureMe Daily", icon: Newspaper, shortcut: "G D" },
  { href: "/skills", label: "Skills and Actions", icon: Sparkles, shortcut: "G S" },
] as const;

export const SECONDARY_NAV = [
  { href: "/reflection", label: "Future Reflection", icon: BookOpenText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
