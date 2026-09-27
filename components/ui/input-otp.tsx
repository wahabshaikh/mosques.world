"use client";

import { OTPInput, OTPInputContext } from "input-otp";
import { useContext, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function InputOTP({ className, containerClassName, ...props }: ComponentProps<typeof OTPInput>) {
  return (
    <OTPInput
      containerClassName={cn("flex items-center gap-2 has-[:disabled]:opacity-50", containerClassName)}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

export function InputOTPGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-2", className)} {...props} />;
}

export function InputOTPSlot({ index, className, ...props }: ComponentProps<"div"> & { index: number }) {
  const context = useContext(OTPInputContext);
  const slot = context?.slots[index];
  return (
    <div
      className={cn(
        "tabular relative flex h-12 w-11 items-center justify-center rounded-[10px] border border-border-strong text-xl font-extrabold",
        slot?.isActive && "ring-2 ring-ring",
        className,
      )}
      {...props}
    >
      {slot?.char}
      {slot?.hasFakeCaret ? <span className="absolute h-6 w-px animate-pulse bg-foreground" aria-hidden="true" /> : null}
    </div>
  );
}
