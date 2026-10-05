"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

const PinMap = lazy(() => import("./pin-map"));

/** The mosque page's small map: MapLibre loads only once the box scrolls near the viewport. */
export function MiniMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShow(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} role="region" aria-label={label} className="h-48 bg-muted">
      {show ? (
        <Suspense fallback={null}>
          <PinMap lat={lat} lng={lng} zoom={15} className="h-48" />
        </Suspense>
      ) : null}
    </div>
  );
}
