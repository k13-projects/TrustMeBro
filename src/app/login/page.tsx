"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-3xl glass-strong glass-sheen grain p-8 h-64 animate-pulse" />
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const emailValid = EMAIL_RE.test(trimmedEmail);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailValid) {
      setError("Please enter a valid email address.");
      setStatus("error");
      return;
    }
    setStatus("sending");
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="relative overflow-hidden rounded-3xl glass-strong glass-sheen grain p-8 space-y-6">
        <div className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
            Sign in
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Magic link
          </h1>
          <p className="text-sm text-foreground/55">
            Enter your email and we&apos;ll send you a one-tap link. No
            password.
          </p>
        </div>

        {status === "sent" ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200"
          >
            Check your inbox at <span className="font-mono">{trimmedEmail}</span>.
            The link signs you in instantly.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3" noValidate>
            <div>
              <label
                htmlFor="login-email"
                className="block text-[11px] uppercase tracking-widest text-foreground/55"
              >
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") {
                    setStatus("idle");
                    setError(null);
                  }
                }}
                placeholder="you@example.com"
                aria-invalid={status === "error" && !emailValid}
                aria-describedby={error ? "login-error" : undefined}
                className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/25 focus-visible:ring-2 focus-visible:ring-white/30 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={status === "sending" || !emailValid}
              className="w-full rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              {status === "sending" ? "Sending..." : "Send magic link"}
            </button>
            {error ? (
              <p id="login-error" role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
