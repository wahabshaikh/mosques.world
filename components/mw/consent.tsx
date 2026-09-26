"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ConsentBanner({ websiteId }: { websiteId?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!websiteId) return;
    if (localStorage.getItem("mw_consent") === "1") {
      loadScript(websiteId);
      return;
    }
    setOpen(true);
  }, [websiteId]);

  if (!open || !websiteId) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg sm:flex-row sm:items-center">
      <p className="text-sm text-muted-foreground">
        We use privacy-friendly analytics to see which searches help people find a mosque. No emails or precise location are sent.
      </p>
      <Button
        type="button"
        onClick={() => {
          localStorage.setItem("mw_consent", "1");
          loadScript(websiteId);
          setOpen(false);
        }}
      >
        Allow
      </Button>
    </div>
  );
}

function loadScript(websiteId: string) {
  if (document.querySelector("script[data-website-id]")) return;
  const script = document.createElement("script");
  script.defer = true;
  script.dataset.websiteId = websiteId;
  script.dataset.domain = "mosques.world";
  script.src = "https://datafa.st/js/script.js";
  document.body.appendChild(script);
}
