import { UpdateModal } from "@/components/mw/update-modal";
import { loadUpdate } from "../../../../m/[slug]/update/load";

export const dynamic = "force-dynamic";

/** Intercepted route: Update timings opens as a dialog (desktop) or drawer (mobile) over the mosque page. */
export default async function UpdateModalPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const data = await loadUpdate(slug);
  const tab = (await searchParams).tab === "amenities" && data.amenities.length > 0 ? "amenities" : "iqamah";
  return <UpdateModal data={data} initialTab={tab} />;
}
