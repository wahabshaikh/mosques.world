import "@/app/globals.css";
import "@fontsource-variable/plus-jakarta-sans";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { ConsentBanner } from "@/components/mw/consent";
import { appEnv } from "@/lib/db/client";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL ?? "https://mosques.world"),
  title: { default: "mosques.world", template: "%s · mosques.world" },
  description: "Find a mosque nearby and see today's calculated adhan times.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  let websiteId: string | undefined;
  try {
    websiteId = appEnv().DATAFAST_WEBSITE_ID;
  } catch {
    websiteId = process.env.DATAFAST_WEBSITE_ID;
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <ConsentBanner websiteId={websiteId} />
        </ThemeProvider>
      </body>
    </html>
  );
}
