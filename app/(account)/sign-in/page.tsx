import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SignInForm } from "@/components/mw/sign-in-form";
import { captchaRequired, googleEnabled } from "@/lib/auth";
import { appEnv } from "@/lib/db/client";
import { phase2Enabled } from "@/lib/phase";
import { currentUser, safeNext } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await phase2Enabled())) notFound();
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  if (await currentUser()) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  const env = appEnv();
  const host = ((await headers()).get("host") ?? "").split(":")[0] ?? "";
  return (
    <div className="mx-auto flex max-w-[1120px] justify-center px-4 py-12">
      <SignInForm
        next={next}
        google={googleEnabled(env)}
        turnstileSiteKey={captchaRequired(env, host) ? env.TURNSTILE_SITE_KEY : undefined}
      />
    </div>
  );
}
