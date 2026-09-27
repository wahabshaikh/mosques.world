"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatTime12, fromMinutes, toMinutes } from "@/lib/trust/facts";
import { cn } from "@/lib/utils";

/**
 * ±5-minute stepper (spec 3.5 TimeStepper). Keyboard: ↑/↓ ±1, PgUp/PgDn ±5; long-press repeats;
 * tap the value to type it. `mode="offset"` edits minutes after adhan instead of a clock time.
 */
export function TimeStepper({
  value,
  onChange,
  label,
  mode = "clock",
  min = 0,
  max = 1439,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  mode?: "clock" | "offset";
  min?: number;
  max?: number;
}) {
  const [typing, setTyping] = useState(false);
  const repeat = useRef<number | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const text = mode === "clock" ? formatTime12(fromMinutes(value)) : `+${value} min`;

  const stop = () => {
    if (repeat.current !== null) window.clearInterval(repeat.current);
    repeat.current = null;
  };
  useEffect(() => stop, []);

  const press = (delta: number) => {
    onChange(clamp(latest.current + delta));
    stop();
    const started = Date.now();
    repeat.current = window.setInterval(() => {
      if (Date.now() - started > 400) onChange(clamp(latest.current + delta));
    }, 120);
  };

  const stepButton = (delta: number, name: string, icon: React.ReactNode) => (
    <button
      type="button"
      aria-label={name}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border-strong bg-background hover:bg-muted"
      onPointerDown={(event) => {
        event.preventDefault();
        press(delta);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onChange(clamp(value + delta));
        }
      }}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      {stepButton(-5, `5 minutes earlier, ${label}`, <Minus className="size-4" />)}
      {typing && mode === "clock" ? (
        <input
          type="time"
          aria-label={`${label} time`}
          autoFocus
          defaultValue={fromMinutes(value)}
          className="tabular h-11 w-[104px] rounded-[10px] border border-input bg-background px-2 text-center font-extrabold"
          onBlur={(event) => {
            if (event.target.value) onChange(clamp(toMinutes(event.target.value)));
            setTyping(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
        />
      ) : (
        <span
          role="spinbutton"
          tabIndex={0}
          aria-label={label}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={text}
          className={cn("tabular w-[92px] cursor-text rounded-[10px] py-2 text-center text-lg font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-ring")}
          onClick={() => setTyping(true)}
          onKeyDown={(event) => {
            const deltas: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 5, PageDown: -5 };
            const delta = deltas[event.key];
            if (delta !== undefined) {
              event.preventDefault();
              onChange(clamp(value + delta));
            } else if (event.key === "Enter" && mode === "clock") {
              setTyping(true);
            }
          }}
        >
          {text}
        </span>
      )}
      {stepButton(5, `5 minutes later, ${label}`, <Plus className="size-4" />)}
    </div>
  );
}
