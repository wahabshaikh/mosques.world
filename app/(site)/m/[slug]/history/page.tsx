import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appEnv } from "@/lib/db/client";
import { placeBySlug } from "@/lib/db/queries";
import { describeValue, factLabel, FACT_KEYS } from "@/lib/trust/facts";
import { placeHistory, type HistoryEntry } from "@/lib/trust/read";
import { relativeAge } from "@/lib/trust/summary";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS: Record<HistoryEntry["status"], { label: string; className: string }> = {
  current: { label: "Current", className: "bg-primary-soft text-primary" },
  candidate: { label: "Proposed", className: "bg-warning-soft text-warning" },
  held: { label: "Awaiting review", className: "bg-warning-soft text-warning" },
  superseded: { label: "Superseded", className: "bg-muted text-muted-foreground" },
  rejected: { label: "Rejected by a moderator", className: "bg-muted text-muted-foreground" },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const place = await placeBySlug(slug);
  return { title: place ? `History · ${place.name}` : "History", robots: { index: false }, alternates: place ? { canonical: `/m/${place.slug}/history` } : undefined };
}

/** Transparent per-fact history: every value, who proposed it, how many confirmed, and when it applied. */
export default async function HistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = await placeBySlug(slug);
  if (!place) notFound();
  const entries = await placeHistory(appEnv().DB, place.id);
  const now = Date.now();
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const id = `${entry.key}|${entry.qualifier}`;
    groups.set(id, [...(groups.get(id) ?? []), entry]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => {
    const [keyA = "", qualifierA = ""] = a.split("|");
    const [keyB = "", qualifierB = ""] = b.split("|");
    return FACT_KEYS.indexOf(keyA as never) - FACT_KEYS.indexOf(keyB as never) || Number(qualifierA) - Number(qualifierB);
  });

  return (
    <article className="mx-auto max-w-[760px] px-4 py-8 lg:px-6">
      <Link href={`/m/${place.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {place.name}
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">History of these times</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Every iqamah and Jumu&apos;ah value proposed for {place.name}, who proposed it, how many people confirmed it and when it applied.
      </p>
      {ordered.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-muted p-6 text-sm">No community times yet.</p>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {ordered.map(([id, items]) => {
            const first = items[0];
            if (!first) return null;
            return (
              <section key={id} data-history={first.key}>
                <h2 className="text-lg font-bold">{factLabel(first.key, first.qualifier)}</h2>
                <ol className="mt-3 flex flex-col divide-y divide-border rounded-2xl border border-border">
                  {items.map((item) => (
                    <li key={item.candidateId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                      <span className="tabular min-w-24 text-base font-extrabold">{describeValue(item.key, item.value)}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS[item.status].className)}>{STATUS[item.status].label}</span>
                      <span className="text-muted-foreground">
                        from {item.effectiveFrom}
                        {item.effectiveTo ? ` to ${item.effectiveTo}` : ""} · proposed by {item.author} {relativeAge(item.createdAt, now)} · {item.backers}{" "}
                        {item.backers === 1 ? "confirmation" : "confirmations"}
                        {item.disputes ? ` · ${item.disputes} disputed` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </article>
  );
}
