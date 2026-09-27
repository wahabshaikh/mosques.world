import type { Metadata } from "next";
import { ProfileForm } from "@/components/mw/profile-form";
import { canChangeUsername, USERNAME_CHANGE_DAYS } from "@/lib/account";
import { TRUST_NAMES } from "@/lib/trust/engine";
import { requireUser } from "@/lib/session";
import { SettingsShell } from "../settings-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile settings", robots: { index: false } };

export default async function ProfileSettingsPage() {
  const user = await requireUser("/settings/profile");
  return (
    <SettingsShell active="/settings/profile" title="Profile">
      <p className="mb-6 text-sm text-muted-foreground">
        Trust level: <strong className="text-foreground">{TRUST_NAMES[user.trustLevel]}</strong> · {user.acceptedCount} accepted
        contributions
      </p>
      <ProfileForm
        initial={{
          username: user.username ?? "",
          name: user.name,
          bio: user.bio ?? "",
          homeCityLabel: user.homeCityLabel,
          homeCountry: user.homeCountry,
        }}
        usernameLocked={!canChangeUsername(user.usernameChangedAt, Date.now())}
        lockDays={USERNAME_CHANGE_DAYS}
      />
    </SettingsShell>
  );
}
