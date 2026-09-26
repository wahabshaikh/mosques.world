import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2.5c.4 2.2 1.6 4 2.6 5.2 1.2 1.4 1.9 2.6 1.9 4.1a4.5 4.5 0 0 1-9 0c0-1.5.7-2.7 1.9-4.1C10.4 6.5 11.6 4.7 12 2.5Z"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          d="M4 20.5V12a8 8 0 0 1 16 0v8.5"
        />
        <path fill="currentColor" d="M10.2 20.5v-3.2h3.6v3.2z" />
      </svg>
    </span>
  );
}
