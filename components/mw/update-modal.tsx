"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { UpdateTimes, type UpdateData, type UpdateTab } from "./update-times";

export function UpdateModal({ data, initialTab }: { data: UpdateData; initialTab?: UpdateTab }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [desktop, setDesktop] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    setDesktop(query.matches);
    const listener = (event: MediaQueryListEvent) => setDesktop(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  const submitted = useRef(false);

  const close = () => {
    setOpen(false);
    if (submitted.current) {
      // Refresh the mosque page once the history step back has landed, so it shows the new times.
      window.addEventListener("popstate", () => router.refresh(), { once: true });
    }
    router.back();
  };
  const onSubmitted = () => {
    submitted.current = true;
  };
  const onOpenChange = (next: boolean) => {
    if (!next) close();
  };
  const title = `Update ${data.placeName}`;
  const description = "Adjust iqamah or Jumu'ah times, or confirm they are still correct.";

  if (!desktop) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[94vh]">
          <DrawerTitle className="px-6 pt-3 text-center text-base font-extrabold">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">{description}</DrawerDescription>
          <UpdateTimes data={data} onDone={close} onSubmitted={onSubmitted} initialTab={initialTab} />
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(928px,calc(100vh-48px))]">
        <div className="flex h-16 shrink-0 items-center justify-center border-b border-border">
          <DialogTitle className="text-base font-extrabold">{title}</DialogTitle>
        </div>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <UpdateTimes data={data} onDone={close} onSubmitted={onSubmitted} initialTab={initialTab} />
      </DialogContent>
    </Dialog>
  );
}
