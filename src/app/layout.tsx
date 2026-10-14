import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FutureMe AI",
  description: "Meet the person you are becoming.",
};

const NAV = [
  { href: "/onboarding", label: "You" },
  { href: "/future", label: "Future" },
  { href: "/chat", label: "Chat" },
  { href: "/plan", label: "Plan" },
  { href: "/daily", label: "Daily" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <header className="border-b border-stone-200 dark:border-stone-800">
          <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              FutureMe
            </Link>
            <ul className="flex gap-1 text-sm">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="rounded-md px-3 py-1.5 text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
