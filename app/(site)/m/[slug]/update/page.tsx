import type { Metadata } from "next";
import Link from "next/link";
import { UpdateTimes } from "@/components/mw/update-times";
import { loadUpdate } from "./load";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Update timings", robots: { index: false } };

export default async function UpdatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadUpdate(slug);
  return (
    <div className="mx-auto max-w-[640px] px-4 py-8">
      <Link href={`/m/${data.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {data.placeName}
      </Link>
      <div className="mt-4 flex flex-col overflow-hidden rounded-[20px] border border-border shadow-[0_6px_20px_rgba(31,29,26,.12)]">
        <h1 className="border-b border-border px-6 py-4 text-center text-base font-extrabold">Update {data.placeName}</h1>
        <UpdateTimes data={data} />
      </div>
    </div>
  );
}
