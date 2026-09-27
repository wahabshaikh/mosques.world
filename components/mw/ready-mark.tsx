"use client";

import { useEffect, useState } from "react";

export function ReadyMark() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return <span data-app-ready={ready ? "true" : "false"} className="sr-only" />;
}
