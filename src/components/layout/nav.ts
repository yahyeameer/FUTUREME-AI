import { AtSign, AudioLines, BookOpenText, Bot, CircleDot, Home, Library, Newspaper, Rocket, Route, Settings, Sparkles, Split, Users } from "lucide-react";

// The sidebar follows TOMORA's journey: explore futures, act on the one you choose, review how it's going, and keep
// control of what TOMORA knows about you. Hrefs and shortcuts are stable; only the grouping and labels are brand.
export const NAV_GROUPS = ["Explore", "Act", "Review", "You"] as const;

export const NAV = [
  { href: "/", label: "Home", icon: Home, shortcut: "G H", group: null },
  { href: "/simulator", label: "Future Simulator", icon: Split, shortcut: "G P", group: "Explore" },
  { href: "/future-self", label: "Future Self", icon: CircleDot, shortcut: "G F", group: "Explore" },
  { href: "/council", label: "Council", icon: Users, shortcut: "G C", group: "Explore" },
  { href: "/roadmap", label: "Life Roadmap", icon: Route, shortcut: "G R", group: "Act" },
  { href: "/missions", label: "Missions", icon: Rocket, shortcut: "G I", group: "Act" },
  { href: "/agent", label: "Agent", icon: Bot, shortcut: "G A", group: "Act" },
  { href: "/skills", label: "Skills and Actions", icon: Sparkles, shortcut: "G S", group: "Act" },
  { href: "/daily", label: "TOMORA Daily", icon: Newspaper, shortcut: "G D", group: "Review" },
  { href: "/memory", label: "Memory Vault", icon: Library, shortcut: "G M", group: "You" },
  { href: "/connections", label: "Connected Accounts", icon: AtSign, shortcut: "G O", group: "You" },
  { href: "/twin", label: "Voice Twin", icon: AudioLines, shortcut: "G T", group: "You" },
] as const;

export const SECONDARY_NAV = [
  { href: "/reflection", label: "Future Reflection", icon: BookOpenText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
