"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { GuestPicker } from "@/components/auth/GuestPicker";

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
      <div className="rounded-3xl glass-strong glass-sheen grain p-8 h-96 animate-pulse" />
    </div>
  );
}

function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const errorParam = params.get("error");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(errorParam);

  async function continueWithGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setBusy(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-md px-4 py-12 sm:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(45rem_22rem_at_50%_-10%,rgba(255,184,0,0.22),transparent_70%)]"
      />

      <div className="relative overflow-hidden rounded-3xl card-tmb grain p-7 sm:p-9 space-y-7">
        <div
          aria-hidden
          className="absolute -top-16 -right-16 size-48 rounded-full bg-primary/20 blur-3xl pointer-events-none"
        />

        <div className="flex flex-col items-center text-center space-y-4">
          <div className="relative">
            <span
              aria-hidden
              className="absolute inset-0 rounded-3xl bg-primary/30 blur-2xl opacity-90"
            />
            <Image
              src="/Design/Logo 2.png"
              alt="TrustMeBro"
              width={96}
              height={96}
              priority
              className="relative rounded-2xl"
              style={{ mixBlendMode: "screen" }}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold tracking-[0.28em] uppercase text-primary/85">
              TrustMeBro · NBA
            </p>
            <h1 className="font-display uppercase text-3xl sm:text-4xl tracking-tight leading-[0.95]">
              Sign in <span className="text-primary">/ Sign up</span>
            </h1>
            <p className="text-sm text-foreground/65 max-w-xs mx-auto">
              One pill, two paths. Google keeps your picks synced across
              devices. Guest mode is faster and stays on this browser.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={continueWithGoogle}
          disabled={busy}
          className="group relative w-full inline-flex items-center justify-center gap-3 rounded-xl bg-white text-black px-4 py-3 font-semibold shadow-[0_10px_30px_-12px_rgba(255,255,255,0.4)] hover:bg-white/95 disabled:opacity-60 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <GoogleGlyph />
          <span>{busy ? "Redirecting to Google…" : "Continue with Google"}</span>
        </button>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-foreground/45">
          <span className="h-px flex-1 bg-white/10" />
          <span>or play as a guest</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <GuestPicker next={next} />

        <p className="text-[10px] text-foreground/40 text-center leading-relaxed">
          By signing in you agree to keep things friendly. No bookmaker
          integration, no real wagering — analysis & education only.
        </p>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
