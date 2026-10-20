import { AtSign, AudioLines, BookOpenText, Bot, CircleDot, Home, Library, Newspaper, Rocket, Route, Settings, Sparkles, Users } from "lucide-react";

export const NAV = [
  { href: "/", label: "Home", icon: Home, shortcut: "G H" },
  { href: "/future-self", label: "Future Self", icon: CircleDot, shortcut: "G F" },
  { href: "/agent", label: "Agent", icon: Bot, shortcut: "G A" },
  { href: "/council", label: "Council", icon: Users, shortcut: "G C" },
  { href: "/missions", label: "Missions", icon: Rocket, shortcut: "G I" },
  { href: "/twin", label: "Voice Twin", icon: AudioLines, shortcut: "G T" },
  { href: "/roadmap", label: "Life Roadmap", icon: Route, shortcut: "G R" },
  { href: "/memory", label: "Memory Vault", icon: Library, shortcut: "G M" },
  { href: "/connections", label: "Connected Accounts", icon: AtSign, shortcut: "G O" },
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
