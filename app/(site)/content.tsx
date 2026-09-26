import type { ReactNode } from "react";

export function ContentPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 lg:px-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <div className="mt-6 space-y-4 text-sm leading-6 text-foreground/90">{children}</div>
    </article>
  );
}
