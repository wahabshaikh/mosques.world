import { haversineKm } from "@/lib/geo/distance";

const FILLER = new Set(["the", "and", "of", "al", "el", "mosque", "masjid", "masjed", "mesjid", "mescidi", "camii", "cami", "jamia", "jami", "jame", "islamic", "muslim", "centre", "center", "community", "cultural", "society", "trust", "e", "ul", "i"]);

function tokens(name: string): Set<string> {
  return new Set(
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 1 && !FILLER.has(word)),
  );
}

/** Overlap of the telling words in two names, 0–1 (Dice coefficient). */
export function nameSimilarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}


type Located = { id: string; name: string; lat: number; lng: number; geohash6: string };

/**
 * Pairs that are probably one mosque mapped twice (a point and a building outline, or two mappers):
 * within 80 m and nearly the same name. Compared within each geohash-6 block (≈1.2×0.6 km) so a city of
 * thousands stays cheap; pairs split across a block edge are left to the moderators' own eyes.
 */
export function likelyDuplicates(places: Located[]): Array<{ aId: string; bId: string; distanceM: number; similarity: number }> {
  const blocks = new Map<string, Located[]>();
  for (const place of places) {
    const block = blocks.get(place.geohash6) ?? [];
    block.push(place);
    blocks.set(place.geohash6, block);
  }
  const pairs: Array<{ aId: string; bId: string; distanceM: number; similarity: number }> = [];
  for (const block of blocks.values()) {
    for (const [index, a] of block.entries()) {
      for (const b of block.slice(index + 1)) {
        const distanceM = Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000);
        const similarity = nameSimilarity(a.name, b.name);
        if (distanceM <= 80 && similarity >= 0.8) pairs.push(a.id < b.id ? { aId: a.id, bId: b.id, distanceM, similarity } : { aId: b.id, bId: a.id, distanceM, similarity });
      }
    }
  }
  return pairs;
}
