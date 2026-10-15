import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Newsreader } from "next/font/google";
import { Providers } from "@/components/providers";
import { PREFS_SCRIPT } from "@/lib/preferences";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Display serif for headlines and moments of meaning; a text serif for long-form reading.
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "FutureMe", template: "%s · FutureMe" },
  description: "A personal AI companion that connects who you are today with who you want to become.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#101112" },
    { media: "(prefers-color-scheme: light)", color: "#f5f2ea" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${newsreader.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <div className="ambient" aria-hidden />
        <div className="relative z-[1] min-h-dvh">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
