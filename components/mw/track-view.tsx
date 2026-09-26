"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export function TrackView({ goal, props }: { goal: string; props?: Record<string, string> }) {
  useEffect(() => {
    track(goal, props);
  }, [goal, props]);
  return null;
}
