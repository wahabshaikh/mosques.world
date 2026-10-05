"use client";

import { useEffect, useState } from "react";

/**
 * One "Get directions" button (spec 4 NextPrayerCard): Apple Maps on iPhone, iPad and Mac, Google Maps
 * everywhere else. Server-rendered as Google so the link works before hydration.
 */
export function DirectionsLink({ lat, lng, label, className }: { lat: number; lng: number; label: string; className?: string }) {
  const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const [href, setHref] = useState(google);
  useEffect(() => {
    if (/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) setHref(`https://maps.apple.com/?daddr=${lat},${lng}`);
  }, [lat, lng]);
  return (
    <a href={href} data-testid="directions" className={className}>
      {label}
    </a>
  );
}
