import { Sparkles } from "lucide-react";
import { levelFor } from "@/lib/hasanat";
import type { Reminder } from "@/lib/reminders";
import { cn } from "@/lib/utils";

/** Someone's hasanat tally with their level and a bar to the next one. */
export function HasanatCard({ total, week, className }: { total: number; week: number; className?: string }) {
  const progress = levelFor(total);
  return (
    <section className={cn("rounded-3xl border border-border bg-card p-5 shadow-card", className)} aria-labelledby="hasanat-title" data-testid="hasanat-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id="hasanat-title" className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            Your hasanat
          </p>
          <p className="tabular mt-1 text-4xl font-extrabold tracking-tight">{total.toLocaleString("en")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {week > 0 ? `+${week} this week` : "Help one masjid this week"}
          </p>
        </div>
        <span className="inline-flex flex-col items-end text-end">
          <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-3 py-1 text-sm font-bold text-gold">
            <Sparkles className="size-4" aria-hidden="true" /> {progress.level.name}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">{progress.level.meaning}</span>
        </span>
      </div>
      {progress.next ? (
        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label={`Progress to ${progress.next.name}`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, progress.percent)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {progress.toNext} more to become <span className="font-semibold text-foreground">{progress.next.name}</span> ({progress.next.meaning})
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** An ayah or hadith set apart from the UI, with its source. */
export function ReminderQuote({ reminder, className }: { reminder: Reminder; className?: string }) {
  return (
    <figure className={cn("border-s-2 border-primary/60 ps-3", className)}>
      <blockquote className="text-[15px] leading-6 italic">“{reminder.text}”</blockquote>
      <figcaption className="mt-1 text-xs font-semibold text-muted-foreground">{reminder.source}</figcaption>
    </figure>
  );
}

/** "+25 hasanat" next to a contribution button. */
export function RewardChip({ points, className }: { points: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-bold text-gold", className)}>
      <Sparkles className="size-3" aria-hidden="true" />+{points} hasanat
    </span>
  );
}

/** The honest small print under every tally. */
export const HASANAT_NOTE = "Hasanat here are a symbolic tally of the help you give. The true reward is with Allah alone.";
