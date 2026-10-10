import type { ReactNode } from "react";
import { ReadyMark } from "@/components/mw/ready-mark";
import { SiteFooter } from "@/components/mw/site-footer";
import { SiteHeader } from "@/components/mw/site-header";
import { TabBar } from "@/components/mw/tab-bar";

export default function SiteLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <ReadyMark />
      <main>{children}</main>
      {modal}
      <SiteFooter />
      <TabBar />
    </>
  );
}
