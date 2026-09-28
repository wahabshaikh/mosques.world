import "@/app/globals.css";
import "@fontsource-variable/plus-jakarta-sans";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { ConsentBanner } from "@/components/mw/consent";
import { HoistMetadata } from "@/components/mw/hoist-metadata";
import { Pwa } from "@/components/mw/pwa";
import { phase5Enabled } from "@/lib/phase";
import { Toaster } from "@/components/ui/sonner";
import { appEnv } from "@/lib/db/client";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL ?? "https://mosques.world"),
  title: { default: "mosques.world", template: "%s · mosques.world" },
  description: "Find a mosque nearby and see today's calculated adhan times.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "mosques.world", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#0B6E4F" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pwa = await phase5Enabled().catch(() => false);
  let websiteId: string | undefined;
  try {
    websiteId = appEnv().DATAFAST_WEBSITE_ID;
  } catch {
    websiteId = process.env.DATAFAST_WEBSITE_ID;
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <HoistMetadata />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
          {pwa ? <Pwa /> : null}
          <ConsentBanner websiteId={websiteId} />
        </ThemeProvider>
      </body>
    </html>
  );
}
