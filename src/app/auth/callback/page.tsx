"use client";

// OAuth callback runs entirely in the browser. PKCE keeps its verifier in
// the browser client's storage, and the browser client also persists the
// resulting session as cookies that the server can read on the next render.
// Doing the exchange client-side sidesteps every server-side cookie-attach
// quirk that was previously dropping sessions on the redirect.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Shell>Finishing sign in…</Shell>}>
      <CallbackInner />
    </Suspense>
  );
}

function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");
  const next = safeNext(params.get("next"));
  // OAuth provider error (Google denied, user cancelled, etc.) lands as a
  // query param too. Surface it verbatim.
  const oauthError = params.get("error_description") || params.get("error");

  const [phase, setPhase] = useState<"working" | "error">("working");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (oauthError) {
        setPhase("error");
        setDetail(oauthError);
        return;
      }
      if (!code) {
        // Nothing to do — bounce to home.
        router.replace(next);
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setPhase("error");
          setDetail(error.message);
          return;
        }
        // Hard navigation so the Server Components re-run with the new
        // session cookie attached. router.replace alone keeps the same
        // RSC payload and the nav badge wouldn't refresh until next reload.
        window.location.replace(next);
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        setDetail(err instanceof Error ? err.message : "Unknown error");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [code, next, oauthError, router]);

  if (phase === "error") {
    return (
      <Shell>
        <p className="text-rose-300 text-sm">Sign in failed.</p>
        {detail ? (
          <p className="text-xs text-foreground/60 mt-2 font-mono break-all">
            {detail}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          {/* Hard-nav back to /login so any half-set PKCE cookies clear before
              the user starts a fresh flow. */}
          <a
            href={`/login?next=${encodeURIComponent(next)}`}
            className="inline-flex rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium hover:bg-white/12 transition-colors"
          >
            Try again
          </a>
          <Link
            href="/"
            className="inline-flex rounded-full border border-white/10 px-4 py-2 text-sm text-foreground/70 hover:bg-white/5 transition-colors"
          >
            Back home
          </Link>
        </div>
      </Shell>
    );
  }

  return <Shell>Finishing sign in…</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-3xl glass-strong glass-sheen grain p-8 space-y-4">
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          Sign in
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{typeof children === "string" ? children : "Sign in"}</h1>
        {typeof children !== "string" ? children : null}
      </div>
    </div>
  );
}
