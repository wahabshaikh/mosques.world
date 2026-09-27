import type { ReactNode } from "react";
import { ReadyMark } from "@/components/mw/ready-mark";
import { SiteFooter } from "@/components/mw/site-footer";
import { SiteHeader } from "@/components/mw/site-header";

export default function SiteLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <ReadyMark />
      <main>{children}</main>
      {modal}
      <SiteFooter />
    </>
  );
}
