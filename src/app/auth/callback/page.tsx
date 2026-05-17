"use client";

// OAuth callback runs entirely in the browser. PKCE keeps its verifier in
// the browser client's storage, and the browser client also persists the
// resulting session as cookies that the server can read on the next render.
// Doing the exchange client-side sidesteps every server-side cookie-attach
// quirk that was previously dropping sessions on the redirect.

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Shell phase="working" />}>
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

// Time the success card stays on screen before redirecting. Long enough for
// the user to read "You're in" and clock the mascot, short enough not to
// feel like a wait.
const SUCCESS_DWELL_MS = 1600;

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");
  const next = safeNext(params.get("next"));
  const oauthError = params.get("error_description") || params.get("error");

  const [phase, setPhase] = useState<"working" | "success" | "error">("working");
  const [detail, setDetail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (oauthError) {
        setPhase("error");
        setDetail(oauthError);
        return;
      }
      if (!code) {
        router.replace(next);
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setPhase("error");
          setDetail(error.message);
          return;
        }
        // Pull a display name for the welcome card.
        const meta = data.session?.user.user_metadata as
          | { full_name?: string; name?: string }
          | undefined;
        setDisplayName(meta?.full_name ?? meta?.name ?? null);
        setPhase("success");
        // Hard navigation so Server Components re-run with the new session
        // cookie. router.replace alone keeps the same RSC payload.
        window.setTimeout(() => {
          if (!cancelled) window.location.replace(next);
        }, SUCCESS_DWELL_MS);
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

  return <Shell phase={phase} detail={detail} displayName={displayName} next={next} />;
}

function Shell({
  phase,
  detail,
  displayName,
  next,
}: {
  phase: "working" | "success" | "error";
  detail?: string | null;
  displayName?: string | null;
  next?: string;
}) {
  return (
    <div className="relative mx-auto max-w-md px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(45rem_22rem_at_50%_-10%,rgba(255,184,0,0.25),transparent_70%)]"
      />

      <div className="relative overflow-hidden rounded-3xl card-tmb grain p-8 space-y-6 text-center">
        <div
          aria-hidden
          className="absolute -top-12 -right-12 size-40 rounded-full bg-primary/20 blur-3xl pointer-events-none"
        />

        {phase === "success" ? (
          <SuccessBody displayName={displayName ?? null} />
        ) : phase === "error" ? (
          <ErrorBody detail={detail ?? null} next={next ?? "/"} />
        ) : (
          <WorkingBody />
        )}
      </div>
    </div>
  );
}

function WorkingBody() {
  return (
    <div className="space-y-5">
      <div className="relative mx-auto w-fit">
        <span
          aria-hidden
          className="absolute inset-0 rounded-3xl bg-primary/30 blur-2xl"
        />
        <Image
          src="/Design/Logo 2.png"
          alt="TrustMeBro"
          width={88}
          height={88}
          priority
          className="relative rounded-2xl logo-float"
          style={{ mixBlendMode: "screen" }}
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold tracking-[0.28em] uppercase text-primary/85">
          Finishing sign in
        </p>
        <h1 className="font-display uppercase text-2xl tracking-tight">
          One sec…
        </h1>
        <p className="text-sm text-foreground/65">
          Handing the baton from Google. This usually takes a heartbeat.
        </p>
      </div>
      <div className="flex justify-center pt-1">
        <span className="size-2 rounded-full bg-primary animate-pulse" />
        <span className="size-2 rounded-full bg-primary mx-1.5 animate-pulse [animation-delay:0.15s]" />
        <span className="size-2 rounded-full bg-primary animate-pulse [animation-delay:0.3s]" />
      </div>
    </div>
  );
}

function SuccessBody({ displayName }: { displayName: string | null }) {
  return (
    <div className="space-y-5 fade-up">
      <div className="relative mx-auto w-fit">
        <span
          aria-hidden
          className="absolute inset-0 rounded-3xl bg-emerald-400/30 blur-2xl"
        />
        <Image
          src="/Design/mascot-hero.png"
          alt="TrustMeBro mascot"
          width={140}
          height={140}
          priority
          className="relative"
        />
      </div>
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
          <CheckCircle2 size={14} strokeWidth={2.6} aria-hidden />
          Signed in
        </div>
        <h1 className="font-display uppercase text-3xl tracking-tight leading-[0.95]">
          {displayName ? (
            <>
              Welcome,{" "}
              <span className="text-primary">{displayName.split(" ")[0]}</span>
            </>
          ) : (
            <>You&apos;re <span className="text-primary">in</span></>
          )}
        </h1>
        <p className="text-sm text-foreground/65">
          Sending you to the picks now. Your bets stay locked to this account
          across devices.
        </p>
      </div>
    </div>
  );
}

function ErrorBody({ detail, next }: { detail: string | null; next: string }) {
  return (
    <div className="space-y-5">
      <div className="relative mx-auto w-fit">
        <span
          aria-hidden
          className="absolute inset-0 rounded-3xl bg-rose-400/30 blur-2xl"
        />
        <div className="relative size-20 rounded-2xl bg-rose-500/15 border border-rose-400/40 grid place-items-center">
          <AlertTriangle
            size={36}
            strokeWidth={2.2}
            className="text-rose-300"
            aria-hidden
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 ring-1 ring-rose-400/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200">
          Sign in failed
        </div>
        <h1 className="font-display uppercase text-2xl tracking-tight">
          Something didn&apos;t click
        </h1>
        {detail ? (
          <p className="text-xs text-foreground/55 font-mono break-all bg-white/5 rounded-lg px-3 py-2 border border-white/10">
            {detail}
          </p>
        ) : (
          <p className="text-sm text-foreground/65">
            Try again — usually a stale token between Google and us.
          </p>
        )}
      </div>
      <div className="flex justify-center gap-2">
        {/* Hard-nav back to /login so any half-set PKCE cookies clear before
            the user starts a fresh flow. */}
        <a
          href={`/login?next=${encodeURIComponent(next)}`}
          className="inline-flex rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-primary hover:bg-primary/20 transition-colors"
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
    </div>
  );
}
