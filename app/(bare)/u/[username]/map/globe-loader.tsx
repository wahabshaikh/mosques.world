"use client";

import { lazy, Suspense } from "react";
import type { ProfilePin } from "@/lib/profile/read";

const ProfileGlobe = lazy(() => import("@/components/mw/profile-globe"));

export function GlobeLoader({ pins, embed }: { pins: ProfilePin[]; embed: boolean }) {
  return (
    <Suspense fallback={null}>
      <ProfileGlobe pins={pins} embed={embed} />
    </Suspense>
  );
}
