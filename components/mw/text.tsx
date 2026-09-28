"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Client-side strings for localized pages (spec P8), keyed by their English source text so
 * components read naturally: `text("Save")`. English pages render without a provider.
 */
const TextContext = createContext<Record<string, string> | null>(null);

export function TextProvider({ messages, children }: { messages: Record<string, string> | null; children: ReactNode }) {
  return <TextContext.Provider value={messages}>{children}</TextContext.Provider>;
}

export function useText() {
  const messages = useContext(TextContext);
  return (source: string, vars?: Record<string, string | number>) => {
    const template = messages?.[source] ?? source;
    return vars ? template.replace(/\{(\w+)\}/g, (match, name: string) => String(vars[name] ?? match)) : template;
  };
}
