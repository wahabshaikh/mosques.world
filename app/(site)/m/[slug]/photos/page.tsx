import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AddPhotoButton } from "@/components/mw/add-photo";
import { ReportPhoto } from "@/components/mw/report-photo";
import { appEnv } from "@/lib/db/client";
import { resolvePlaceSlug } from "@/lib/db/queries";
import { placePhotos } from "@/lib/media";
import { phase3Enabled } from "@/lib/phase";
import { PHOTO_CATEGORIES, photoUrl } from "@/lib/photos";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolvePlaceSlug(slug);
  const name = resolved && "place" in resolved ? resolved.place.name : "Photos";
  return { title: `Photos · ${name}`, alternates: { canonical: `/m/${slug}/photos` } };
}

export default async function PhotosPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await phase3Enabled())) notFound();
  const { slug } = await params;
  const resolved = await resolvePlaceSlug(slug);
  if (!resolved) notFound();
  if ("redirect" in resolved) permanentRedirect(`/m/${resolved.redirect}/photos`);
  const place = resolved.place;
  if (place.status === "pending") notFound();
  const photos = await placePhotos(appEnv().DB, place.id, 200);
  const groups = PHOTO_CATEGORIES.map((category) => ({ ...category, photos: photos.filter((photo) => photo.category === category.value) })).filter(
    (group) => group.photos.length > 0,
  );
  return (
    <article className="mx-auto max-w-[1120px] px-4 py-8 lg:px-6">
      <Link href={`/m/${place.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {place.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Photos</h1>
        <AddPhotoButton placeId={place.id} label="Add a photo" />
      </div>
      {groups.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-muted p-6 text-sm">No photos yet. Photos of the entrance, the women&apos;s area and the wudhu area help most.</p>
      ) : (
        groups.map((group) => (
          <section key={group.value} className="mt-8" data-category={group.value}>
            <h2 className="mb-3 text-xl font-bold">{group.label}</h2>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {group.photos.map((photo) => (
                <li key={photo.id} className="group relative overflow-hidden rounded-2xl">
                  <a href={photoUrl(photo.id, 1600)}>
                    <img
                      src={photoUrl(photo.id, 800)}
                      alt={`${group.label} at ${place.name}`}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                      style={{ background: photo.color ?? "#ECEEE7" }}
                    />
                  </a>
                  <div className="absolute top-2 right-2">
                    <ReportPhoto placeId={place.id} photoId={photo.id} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </article>
  );
}
