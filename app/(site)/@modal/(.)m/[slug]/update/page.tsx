import { UpdateModal } from "@/components/mw/update-modal";
import { loadUpdate } from "../../../../m/[slug]/update/load";

export const dynamic = "force-dynamic";

/** Intercepted route: Update timings opens as a dialog (desktop) or drawer (mobile) over the mosque page. */
export default async function UpdateModalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadUpdate(slug);
  return <UpdateModal data={data} />;
}
