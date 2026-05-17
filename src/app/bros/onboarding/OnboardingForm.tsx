"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HANDLE_REGEX, HANDLE_MIN, HANDLE_MAX } from "@/lib/bros/handle";

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken" }
  | { state: "invalid"; reason: string };

export function OnboardingForm({
  suggestedHandle,
  suggestedDisplayName,
  nextUrl,
}: {
  suggestedHandle: string;
  suggestedDisplayName: string;
  nextUrl: string | null;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState(suggestedHandle);
  const [displayName, setDisplayName] = useState(suggestedDisplayName);
  const [bio, setBio] = useState("");
  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>({
    state: "idle",
  });
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    const value = handle.trim().toLowerCase();
    if (value.length < HANDLE_MIN) {
      setAvailability({
        state: "invalid",
        reason: `min ${HANDLE_MIN} chars`,
      });
      return;
    }
    if (value.length > HANDLE_MAX) {
      setAvailability({
        state: "invalid",
        reason: `max ${HANDLE_MAX} chars`,
      });
      return;
    }
    if (!HANDLE_REGEX.test(value)) {
      setAvailability({
        state: "invalid",
        reason: "letters, numbers, underscore only",
      });
      return;
    }
    setAvailability({ state: "checking" });
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/profile/check-handle?handle=${encodeURIComponent(value)}`,
        );
        const body = await res.json();
        if (body?.available) {
          setAvailability({ state: "available" });
        } else {
          setAvailability({ state: "taken" });
        }
      } catch {
        setAvailability({ state: "idle" });
      }
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [handle]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (availability.state === "taken") {
      setSubmitError("That handle is taken.");
      return;
    }
    if (availability.state === "invalid") {
      setSubmitError(availability.reason);
      return;
    }
    if (!displayName.trim()) {
      setSubmitError("Display name required");
      return;
    }
    startSubmit(async () => {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: handle.trim().toLowerCase(),
          display_name: displayName.trim(),
          bio: bio.trim() || null,
        }),
      });
      if (res.status === 409) {
        setSubmitError("That handle is taken.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(body?.error ?? "Couldn't save — try again");
        return;
      }
      const body = await res.json();
      const target = nextUrl ?? `/bros/${body.profile?.handle ?? handle.trim().toLowerCase()}`;
      router.push(target);
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="glass-strong rounded-3xl p-6 space-y-5">
      <Field
        label="Handle"
        hint={`${HANDLE_MIN}–${HANDLE_MAX} chars · lowercase letters, numbers, underscores`}
      >
        <div className="flex items-center rounded-xl bg-black/30 border border-white/10 focus-within:border-primary/60 px-3">
          <span className="text-foreground/45 font-mono">@</span>
          <input
            type="text"
            value={handle}
            onChange={(e) =>
              setHandle(e.target.value.replace(/\s+/g, "").toLowerCase())
            }
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={HANDLE_MAX}
            className="flex-1 bg-transparent py-2.5 outline-none font-mono text-sm"
          />
          <AvailabilityChip availability={availability} />
        </div>
      </Field>

      <Field label="Display name" hint="What other bros see in the feed">
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={48}
          className="w-full rounded-xl bg-black/30 border border-white/10 focus:border-primary/60 px-3 py-2.5 outline-none text-sm"
        />
      </Field>

      <Field
        label="Bio"
        hint="Optional · 280 chars"
      >
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder="What's your edge?"
          className="w-full rounded-xl bg-black/30 border border-white/10 focus:border-primary/60 px-3 py-2.5 outline-none text-sm resize-none"
        />
      </Field>

      {submitError ? (
        <p className="text-xs text-rose-300">{submitError}</p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || availability.state === "taken" || availability.state === "invalid"}
        className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary-hover px-4 py-2.5 text-sm font-semibold uppercase tracking-widest transition-colors disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Claim handle"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-widest text-foreground/45 font-medium">
          {label}
        </span>
        {hint ? (
          <span className="text-[10px] text-foreground/40">{hint}</span>
        ) : null}
      </div>
      {children}
    </label>
  );
}

function AvailabilityChip({ availability }: { availability: Availability }) {
  switch (availability.state) {
    case "checking":
      return (
        <span className="text-[10px] uppercase tracking-widest text-foreground/45">
          checking…
        </span>
      );
    case "available":
      return (
        <span className="text-[10px] uppercase tracking-widest text-emerald-300">
          available
        </span>
      );
    case "taken":
      return (
        <span className="text-[10px] uppercase tracking-widest text-rose-300">
          taken
        </span>
      );
    case "invalid":
      return (
        <span className="text-[10px] uppercase tracking-widest text-amber-300">
          {availability.reason}
        </span>
      );
    default:
      return null;
  }
}
