"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { track } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { useTurnstile } from "./turnstile";

export function SignInForm({ next, google, turnstileSiteKey }: { next: string; google: boolean; turnstileSiteKey?: string }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const turnstile = useTurnstile(turnstileSiteKey);
  const done = (method: string) => `/onboarding?next=${encodeURIComponent(next)}&m=${method}`;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track("signup_started", {});
  }, []);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const token = turnstileSiteKey ? await turnstile.token() : null;
    const result = await authClient.emailOtp.sendVerificationOtp(
      { email: email.trim().toLowerCase(), type: "sign-in" },
      token ? { headers: { "x-captcha-response": token } } : undefined,
    );
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Could not send a code. Try again.");
      turnstile.reset();
      return;
    }
    setStep("code");
  }

  async function verify(code: string) {
    setPending(true);
    setError(null);
    const result = await authClient.signIn.emailOtp({ email: email.trim().toLowerCase(), otp: code });
    if (result.error) {
      setPending(false);
      setOtp("");
      setError(result.error.message ?? "That code did not work.");
      return;
    }
    window.location.assign(done("email"));
  }

  return (
    <section className="w-full max-w-md rounded-[20px] border border-border p-6 shadow-[0_6px_20px_rgba(31,29,26,.12)] sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Sign in to mosques.world</h1>
      <p className="mt-2 text-sm text-muted-foreground">Add and confirm iqamah times for the mosques you pray at.</p>
      {google ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="mt-6 w-full"
            onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: done("google") })}
          >
            Continue with Google
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : (
        <div className="mt-6" />
      )}
      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label className="text-sm font-semibold" htmlFor="email">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
          <div ref={turnstile.ref} />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Sending…" : "Email me a code"}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            We sent a 6-digit code to <strong>{email}</strong>.
          </p>
          <InputOTP
            maxLength={6}
            value={otp}
            onChange={setOtp}
            onComplete={(code) => void verify(code)}
            aria-label="6-digit code"
            autoFocus
            disabled={pending}
          >
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button type="button" variant="secondary" disabled={pending || otp.length !== 6} onClick={() => void verify(otp)}>
            {pending ? "Checking…" : "Continue"}
          </Button>
          <button
            type="button"
            className="text-left text-sm underline"
            onClick={() => {
              setStep("email");
              setOtp("");
            }}
          >
            Use a different email
          </button>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p className="mt-6 text-xs text-muted-foreground">
        By continuing you agree to the <Link href="/terms" className="underline">terms</Link> and the{" "}
        <Link href="/guidelines" className="underline">community guidelines</Link>.
      </p>
    </section>
  );
}
