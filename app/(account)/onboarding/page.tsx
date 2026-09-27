import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OnboardingForm } from "@/components/mw/onboarding-form";
import { phase2Enabled } from "@/lib/phase";
import { currentUser, safeNext, signInPath } from "@/lib/session";
import { suggestUsernames } from "@/lib/username";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await phase2Enabled())) notFound();
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const method = params.m === "google" ? "google" : "email";
  const user = await currentUser();
  if (!user) redirect(signInPath(next));
  if (user.username && user.guidelinesAcceptedAt) redirect(next);
  return (
    <div className="mx-auto flex max-w-[1120px] justify-center px-4 py-12">
      <OnboardingForm
        next={next}
        method={method}
        initialName={user.name}
        initialUsername={user.username ?? ""}
        suggestions={user.username ? [] : suggestUsernames(user.name, user.email)}
      />
    </div>
  );
}
