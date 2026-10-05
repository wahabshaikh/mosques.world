import { UpdateModal } from "@/components/mw/update-modal";
import { tabFrom } from "@/lib/places/update-tab";
import { loadUpdate } from "../../../../m/[slug]/update/load";

export const dynamic = "force-dynamic";

/** Intercepted route: Update timings opens as a dialog (desktop) or drawer (mobile) over the mosque page. */
export default async function UpdateModalPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const data = await loadUpdate(slug);
  const tab = tabFrom((await searchParams).tab, data.amenities.length > 0);
  return <UpdateModal data={data} initialTab={tab} />;
}
