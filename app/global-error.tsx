"use client";

import { useEffect } from "react";
import { captureClientException } from "@/lib/sentry";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureClientException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="text-3xl font-bold">Something went wrong</h1>
          <button type="button" className="mt-6 h-11 rounded-[12px] bg-primary px-4 font-semibold text-primary-foreground" onClick={reset}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
