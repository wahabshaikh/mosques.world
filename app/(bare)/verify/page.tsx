import type { Metadata } from "next";
import { QuickVerify } from "@/components/mw/quick-verify";
import { appEnv } from "@/lib/db/client";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "I'm here", robots: { index: false } };

/** Quick verify at the mosque (spec 4.3, flow F6). `?place=` preselects the place when it is within 150 m. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const place = (await searchParams).place;
  const placeHint = typeof place === "string" ? place : null;
  const user = await requireUser(placeHint ? `/verify?place=${encodeURIComponent(placeHint)}` : "/verify");
  let vapidKey: string | null = null;
  try {
    vapidKey = appEnv().VAPID_PUBLIC_KEY ?? null;
  } catch {
    vapidKey = null;
  }
  return <QuickVerify placeHint={placeHint} username={user.username ?? ""} vapidKey={vapidKey} />;
}
