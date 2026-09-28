import { Accessibility, BookOpen, Clock, Droplet, HeartHandshake, Moon, SquareParking, Toilet, UserRound, type LucideProps } from "lucide-react";

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  "amenity.women_section": UserRound,
  "amenity.wudhu_men": Droplet,
  "amenity.wudhu_women": Droplet,
  "amenity.step_free": Accessibility,
  "amenity.parking": SquareParking,
  "amenity.toilets": Toilet,
  "amenity.classes": BookOpen,
  "amenity.janazah": HeartHandshake,
  "amenity.open_between_prayers": Clock,
  "amenity.open_for_fajr": Moon,
};

export function AmenityIcon({ amenity, ...props }: { amenity: string } & LucideProps) {
  const Icon = ICONS[amenity] ?? Clock;
  return <Icon strokeWidth={1.6} aria-hidden="true" {...props} />;
}
