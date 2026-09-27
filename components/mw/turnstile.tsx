"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
  execute: (id: string) => void;
};

function api(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

function loadScript(): Promise<void> {
  if (api()) return Promise.resolve();
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    if (!existing) {
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.turnstile = "mosques";
      document.head.appendChild(script);
    }
  });
}

/** Invisible-first Turnstile: renders into `ref` and resolves a token on demand. */
export function useTurnstile(siteKey?: string) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string>("");
  const pending = useRef<((token: string) => void) | null>(null);
  const latest = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    const host = ref.current;
    let cancelled = false;
    void loadScript().then(() => {
      const turnstile = api();
      if (cancelled || !turnstile) return;
      widget.current = turnstile.render(host, {
        sitekey: siteKey,
        appearance: "interaction-only",
        callback: (token: string) => {
          latest.current = token;
          pending.current?.(token);
          pending.current = null;
        },
      });
    });
    return () => {
      cancelled = true;
      if (widget.current) api()?.remove(widget.current);
    };
  }, [siteKey]);

  return {
    ref,
    token(): Promise<string | null> {
      if (!siteKey) return Promise.resolve(null);
      if (latest.current) return Promise.resolve(latest.current);
      return new Promise((resolve) => {
        pending.current = resolve;
        window.setTimeout(() => resolve(latest.current), 15_000);
      });
    },
    reset() {
      latest.current = null;
      if (widget.current) api()?.reset(widget.current);
    },
  };
}
