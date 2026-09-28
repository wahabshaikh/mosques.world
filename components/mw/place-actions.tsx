"use client";

import { CircleAlert, Flag } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { useText } from "./text";

type Viewer = { username: string | null; trustLevel: number; role: string } | null;

type ViewerContext = {
  viewer: Viewer;
  loaded: boolean;
  votes: Record<string, 1 | -1>;
  saved: boolean;
  setSaved: (saved: boolean) => void;
  /** An action the viewer started before signing in (`?intent=`), for components to resume. */
  intent: string | null;
  vote: (candidateId: string, polarity: 1 | -1, factKey: string) => Promise<void>;
  signInHref: (intent?: string) => string;
};

type MeBody = { user: Viewer; votes: Record<string, 1 | -1>; saved?: boolean };

const Context = createContext<ViewerContext | null>(null);

export function useViewer(): ViewerContext {
  const value = useContext(Context);
  if (!value) throw new Error("useViewer outside ViewerProvider");
  return value;
}

/**
 * Per-viewer state for a mosque page whose HTML is shared and cached: the viewer and their votes
 * are fetched client-side. Also replays an `?intent=vote:<candidate>:<polarity>` after sign-in (flow F2).
 */
export function ViewerProvider({ placeId, children }: { placeId: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [viewer, setViewer] = useState<Viewer>(null);
  const [loaded, setLoaded] = useState(false);
  const [votes, setVotes] = useState<Record<string, 1 | -1>>({});
  const [saved, setSaved] = useState(false);
  const [intent, setIntent] = useState<string | null>(null);
  const replayed = useRef(false);

  const signInHref = useCallback(
    (intent?: string) => {
      const next = intent ? `${pathname}?intent=${encodeURIComponent(intent)}` : pathname;
      return `/sign-in?next=${encodeURIComponent(next)}`;
    },
    [pathname],
  );

  const vote = useCallback(
    async (candidateId: string, polarity: 1 | -1, factKey: string) => {
      const response = await fetch("/api/v1/votes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId, polarity, source: "observed" }),
      });
      if (response.status === 401) {
        window.location.assign(signInHref(`vote:${candidateId}:${polarity}`));
        return;
      }
      if (response.status === 403) {
        window.location.assign(`/onboarding?next=${encodeURIComponent(`${pathname}?intent=vote:${candidateId}:${polarity}`)}`);
        return;
      }
      const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) {
        toast.error(body?.error ?? "Could not save your vote.");
        return;
      }
      track("vote_cast", { polarity, fact_key: factKey });
      setVotes((current) => ({ ...current, [candidateId]: polarity }));
      toast.success(body?.message ?? "Thanks!");
      router.refresh();
    },
    [pathname, router, signInHref],
  );

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/v1/places/${placeId}/me`)
      .then((response) => (response.ok ? (response.json() as Promise<MeBody>) : null))
      .then((body: MeBody | null) => {
        if (cancelled) return;
        setViewer(body?.user ?? null);
        setVotes(body?.votes ?? {});
        setSaved(body?.saved ?? false);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  useEffect(() => {
    const intent = params.get("intent");
    if (!loaded || replayed.current || !intent) return;
    replayed.current = true;
    router.replace(pathname, { scroll: false });
    if (viewer) setIntent(intent);
    const [kind, candidateId, polarity] = intent.split(":");
    if (kind !== "vote" || !candidateId || !viewer) return;
    void vote(candidateId, polarity === "-1" ? -1 : 1, "intent");
  }, [loaded, params, pathname, router, viewer, vote]);

  return <Context.Provider value={{ viewer, loaded, votes, saved, setSaved, intent, vote, signInHref }}>{children}</Context.Provider>;
}

export type DisputeItem = {
  factKey: string;
  label: string;
  currentId: string;
  currentLabel: string;
  challengerId: string;
  challengerLabel: string;
  challengerPeople: number;
};

export function DisputeBanner({ item }: { item: DisputeItem }) {
  const { votes, vote } = useViewer();
  const [pending, setPending] = useState(false);
  const mine = votes[item.challengerId] === 1 ? "challenger" : votes[item.currentId] === 1 ? "current" : null;
  const act = async (candidateId: string) => {
    setPending(true);
    await vote(candidateId, 1, item.factKey);
    setPending(false);
  };
  return (
    <div className="flex flex-col gap-3 border-t border-border bg-warning-soft px-4 py-4 sm:flex-row sm:items-center sm:px-5" data-dispute={item.factKey}>
      <CircleAlert className="hidden size-5 shrink-0 text-warning sm:block" aria-hidden="true" />
      <p className="flex-1 text-sm">
        <strong>{item.label} may have changed.</strong> {item.challengerPeople} {item.challengerPeople === 1 ? "person says" : "people say"} the
        iqamah is now {item.challengerLabel}.
        {mine ? <span className="block text-xs text-muted-foreground">You said {mine === "challenger" ? item.challengerLabel : item.currentLabel}.</span> : null}
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="bg-background" disabled={pending} onClick={() => void act(item.currentId)}>
          Still {item.currentLabel}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => void act(item.challengerId)}>
          Confirm {item.challengerLabel}
        </Button>
      </div>
    </div>
  );
}

export function ConfirmButton({ candidateId, factKey, label }: { candidateId: string; factKey: string; label: string }) {
  const { votes, vote } = useViewer();
  const [pending, setPending] = useState(false);
  if (votes[candidateId] === 1) return <span className="text-xs font-semibold text-primary">You confirmed</span>;
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs font-semibold underline"
      onClick={async () => {
        setPending(true);
        await vote(candidateId, 1, factKey);
        setPending(false);
      }}
    >
      Confirm {label}
    </button>
  );
}

export function UpdateLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={className} onClick={() => track("update_opened", {})}>
      {children}
    </Link>
  );
}

const ReportDialog = lazy(() => import("./report-dialog"));

export function ReportProblem({ placeId, facts, reasons = false }: { placeId: string; facts: Array<{ key: string; label: string }>; reasons?: boolean }) {
  const { viewer, loaded, signInHref } = useViewer();
  const [open, setOpen] = useState(false);
  const text = useText();
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground underline"
        onClick={() => {
          if (loaded && !viewer) {
            window.location.assign(signInHref());
            return;
          }
          setOpen(true);
        }}
      >
        <Flag className="size-4" aria-hidden="true" /> {text(reasons ? "Report a problem" : "Report a timing change")}
      </button>
      {open ? (
        <Suspense fallback={null}>
          <ReportDialog placeId={placeId} facts={facts} open={open} onOpenChange={setOpen} reasons={reasons} />
        </Suspense>
      ) : null}
    </>
  );
}
