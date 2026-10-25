import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Newsreader } from "next/font/google";
import { Providers } from "@/components/providers";
import { BRAND, BRAND_COLORS } from "@/lib/brand";
import { PREFS_SCRIPT } from "@/lib/preferences";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// TOMORA's type: Instrument Serif for the wordmark and editorial headings, Geist for everything people read and use,
// Newsreader for long-form reading. next/font self-hosts them with fallbacks, so there's no layout shift or third-party
// font request at runtime.
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: `${BRAND.name}: ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  // Share previews carry the brand only; private pages are behind the access lock and never put personal context in a URL.
  openGraph: { type: "website", siteName: BRAND.name, title: `${BRAND.name}: ${BRAND.tagline}`, description: BRAND.description },
  twitter: { card: "summary_large_image", title: `${BRAND.name}: ${BRAND.tagline}`, description: BRAND.description },
  appleWebApp: { title: BRAND.name, statusBarStyle: "black-translucent" },
  metadataBase: publicUrl(),
};

/** Absolute share-image URLs need the public address; without it Next falls back to the request host. */
function publicUrl() {
  try {
    return process.env.FUTUREME_PUBLIC_URL ? new URL(process.env.FUTUREME_PUBLIC_URL) : undefined;
  } catch {
    return undefined;
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: BRAND_COLORS.ink },
    { media: "(prefers-color-scheme: light)", color: BRAND_COLORS.ivory },
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
        <div className="relative z-[1] min-h-dvh">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
