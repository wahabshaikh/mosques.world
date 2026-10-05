import { Camera } from "lucide-react";
import Link from "next/link";
import type { CommonsImage } from "@/lib/enrich/wikidata";
import { photoUrl, type PhotoView } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { AddPhotoButton } from "./add-photo";

function Illustration({ tint }: { tint: { bg: string; fg: string } }) {
  return (
    <svg viewBox="0 0 540 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <rect width="540" height="240" fill={tint.bg} />
      <path d="M170 240V150Q170 95 270 80Q370 95 370 150V240Z" fill={tint.fg} />
      <path d="M255 80V48M285 80V48M262 48h16" stroke={tint.fg} strokeWidth="6" />
      <rect x="120" y="120" width="24" height="120" fill={tint.fg} />
      <rect x="396" y="120" width="24" height="120" fill={tint.fg} />
      <path d="M240 240v-54q30-26 60 0v54z" fill={tint.bg} opacity="0.6" />
    </svg>
  );
}

/** 1 large + up to 4 small photos (spec 3.5 PhotoGrid); a credited Commons photo, or a slim prompt, when there are none. */
export function PhotoGrid({
  photos,
  total,
  tint,
  slug,
  placeId,
  canAdd,
  turnstileSiteKey,
  commons = null,
  text = (source: string, vars?: Record<string, string | number>) => source.replace(/\{(\w+)\}/g, (match, name: string) => String(vars?.[name] ?? match)),
}: {
  photos: PhotoView[];
  total: number;
  tint: { bg: string; fg: string };
  slug: string;
  placeId: string;
  canAdd: boolean;
  turnstileSiteKey?: string;
  /** A freely licensed photo from Wikimedia Commons, shown with its credit until the community adds photos. */
  commons?: CommonsImage | null;
  /** Localizes the button labels (spec P8); English by default. */
  text?: (source: string, vars?: Record<string, string | number>) => string;
}) {
  if (photos.length === 0 && commons) {
    return (
      <figure className="mt-6" data-testid="commons-photo">
        <div className="relative aspect-[16/7] overflow-hidden rounded-2xl" style={{ background: tint.bg }}>
          <img src={commons.thumb} alt={text("Photo of this place")} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          {canAdd ? (
            <div className="absolute right-4 bottom-4">
              <AddPhotoButton placeId={placeId} turnstileSiteKey={turnstileSiteKey} label={text("Add photos")} />
            </div>
          ) : null}
        </div>
        <figcaption className="mt-1.5 text-xs text-muted-foreground">
          {text("Photo")}: {commons.author ? `${commons.author}, ` : ""}
          {commons.licenseUrl ? (
            <a href={commons.licenseUrl} className="underline" rel="noopener license">
              {commons.license}
            </a>
          ) : (
            commons.license
          )}
          {", "}
          <a href={commons.page} className="underline" rel="noopener">
            {text("via Wikimedia Commons")}
          </a>
        </figcaption>
      </figure>
    );
  }
  if (photos.length === 0) {
    return (
      <div className="mt-6 flex items-center gap-4 rounded-2xl border border-dashed border-border p-3" data-testid="photo-placeholder">
        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl">
          <Illustration tint={tint} />
        </div>
        <p className="flex-1 text-sm text-muted-foreground">
          <span className="sr-only">No photos yet. </span>
          {text("A photo of the entrance helps people find their way.")}
        </p>
        {canAdd ? <AddPhotoButton placeId={placeId} turnstileSiteKey={turnstileSiteKey} label={text("Add photos")} /> : null}
      </div>
    );
  }
  const [first, ...rest] = photos;
  return (
    <div className="relative mt-6">
      <div className={cn("grid aspect-[16/7] gap-2 overflow-hidden rounded-2xl", rest.length > 0 ? "grid-cols-4 grid-rows-2" : "grid-cols-1")} data-testid="photo-grid">
        {first ? (
          <img
            src={photoUrl(first.id, 1600)}
            srcSet={`${photoUrl(first.id, 800)} 800w, ${photoUrl(first.id, 1600)} 1600w`}
            sizes="(min-width: 1024px) 660px, 100vw"
            alt={`${first.category.replace("_", " ")} photo`}
            className={cn("h-full w-full object-cover", rest.length > 0 && "col-span-2 row-span-2")}
            style={{ background: first.color ?? tint.bg }}
            fetchPriority="high"
          />
        ) : null}
        {rest.slice(0, 4).map((photo) => (
          <img
            key={photo.id}
            src={photoUrl(photo.id, 400)}
            alt={`${photo.category.replace("_", " ")} photo`}
            loading="lazy"
            className="h-full w-full object-cover"
            style={{ background: photo.color ?? tint.bg }}
          />
        ))}
      </div>
      <div className="absolute right-4 bottom-4 flex gap-2">
        {canAdd ? <AddPhotoButton placeId={placeId} turnstileSiteKey={turnstileSiteKey} label={text("Add")} /> : null}
        <Link href={`/m/${slug}/photos`} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-foreground bg-background px-3.5 text-sm font-semibold">
          <Camera className="size-4" aria-hidden="true" /> {total === 1 ? text("Show the photo") : text("Show all {n} photos", { n: total })}
        </Link>
      </div>
    </div>
  );
}
