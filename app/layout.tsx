import "@/app/globals.css";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/noto-naskh-arabic/arabic-400.css";
import "@fontsource/noto-naskh-arabic/arabic-700.css";
import "@fontsource/amiri/arabic-400.css";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { ConsentBanner } from "@/components/mw/consent";
import { HoistMetadata } from "@/components/mw/hoist-metadata";
import { Pwa } from "@/components/mw/pwa";
import { phase5Enabled } from "@/lib/phase";
import { Toaster } from "@/components/ui/sonner";
import { appEnv } from "@/lib/db/client";
import { direction } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n/server";
import { clientMessages } from "@/lib/i18n/client-messages";
import { TextProvider } from "@/components/mw/text";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL ?? "https://mosques.world"),
  title: { default: "mosques.world", template: "%s · mosques.world" },
  description: "Find a mosque nearby and see today's calculated adhan times.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "mosques.world", statusBarStyle: "default" },
  // Listing `icons` replaces the file-based app/icon.svg link, so name every icon here. /favicon.ico is a real
  // file in public/ (scripts/build-icons.mjs) for browsers and crawlers that request it directly.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { themeColor: "#0B6E4F" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pwa = await phase5Enabled().catch(() => false);
  const locale = await getLocale();
  let websiteId: string | undefined;
  try {
    websiteId = appEnv().DATAFAST_WEBSITE_ID;
  } catch {
    websiteId = process.env.DATAFAST_WEBSITE_ID;
  }
  return (
    <html lang={locale} dir={direction(locale)} suppressHydrationWarning>
      <body>
        <HoistMetadata />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TextProvider messages={clientMessages(locale)}>{children}</TextProvider>
          <Toaster />
          {pwa ? <Pwa /> : null}
          <ConsentBanner websiteId={websiteId} />
        </ThemeProvider>
      </body>
    </html>
  );
}
