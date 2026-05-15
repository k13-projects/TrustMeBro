"use client";

import { useState } from "react";
import useSWR from "swr";

type Profile = { display_name: string; last_seen_at: string };

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : { profiles: [] }));

export function GuestPicker({ next }: { next: string }) {
  const { data } = useSWR<{ profiles: Profile[] }>("/api/guest/recent", fetcher);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter a name to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/guest/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(body?.error === "invalid_name" ? "Use 1–24 letters, numbers, spaces, or dashes." : "Something went wrong.");
        setBusy(false);
        return;
      }
      window.location.assign(next || "/");
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  const profiles = data?.profiles ?? [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) submit(name);
      }}
      className="space-y-3"
      noValidate
    >
      <label
        htmlFor="guest-name"
        className="block text-[11px] uppercase tracking-widest text-foreground/55"
      >
        What should we call you?
      </label>
      <input
        id="guest-name"
        name="name"
        type="text"
        autoComplete="off"
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (error) setError(null);
        }}
        placeholder="Eren, Kazimiro, …"
        maxLength={24}
        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/25 focus-visible:ring-2 focus-visible:ring-white/30 transition-colors"
      />
      <button
        type="submit"
        disabled={busy || name.trim().length === 0}
        className="w-full rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        {busy ? "Setting up…" : "Continue as guest"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {profiles.length > 0 ? (
        <div className="pt-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-foreground/45">
            Or pick a recent name
          </p>
          <div className="flex flex-wrap gap-2">
            {profiles.slice(0, 12).map((p) => (
              <button
                key={p.display_name}
                type="button"
                onClick={() => submit(p.display_name)}
                disabled={busy}
                className="rounded-full bg-white/6 hover:bg-white/12 border border-white/10 px-3 py-1 text-xs transition-colors disabled:opacity-50"
              >
                {p.display_name}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-foreground/40 leading-relaxed">
            Heads up: anyone who types the same name sees those bets. Use Google
            sign-in above for real isolation.
          </p>
        </div>
      ) : null}
    </form>
  );
}
