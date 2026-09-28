import type { ReactNode } from "react";
import { ReadyMark } from "@/components/mw/ready-mark";

/** Chrome-less pages (full-screen and embeddable maps). */
export default function BareLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ReadyMark />
      <main>{children}</main>
    </>
  );
}
