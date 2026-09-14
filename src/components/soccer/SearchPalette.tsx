"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, Star, X } from "lucide-react";
import { cx, focusRing } from "@/lib/design/tokens";

// Eighty-one clubs have played in this season's Champions League. Scrolling a
// table to reach one is not finding it. Cmd-K or the magnifier opens this;
// results come from the database only, so it answers immediately.

type TeamHit = {
  kind: "team";
  id: number;
  name: string;
  abbreviation: string;
  crest: string | null;
  competitionLabel: string | null;
  followed: boolean;
};
type MatchHit = {
  kind: "match";
  id: number;
  competitionLabel: string;
  date: string;
  datetime: string | null;
  finished: boolean;
  home: { name: string; crest: string | null };
  away: { name: string; crest: string | null };
  score: string | null;
};
type Hit = TeamHit | MatchHit;

const RECENTS_KEY = "tmb_recent_searches";

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  try {
    const next = [q, ...readRecents().filter((r) => r !== q)].slice(0, 5);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // A private window or blocked storage is not a reason to fail a search.
  }
}

export function SearchPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [teams, setTeams] = useState<TeamHit[]>([]);
  const [matches, setMatches] = useState<MatchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  // Lazily initialised rather than set from an effect: reading storage is
  // already guarded, and this keeps the list out of the render cascade.
  const [recents, setRecents] = useState<string[]>(() => readRecents());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hits: Hit[] = useMemo(() => [...teams, ...matches], [teams, matches]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Debounced fetch. An empty query is still useful: it returns followed clubs
  // and the next fixtures.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/soccer/search?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { teams?: TeamHit[]; matches?: MatchHit[] };
        if (!alive) return;
        setTeams(data.teams ?? []);
        setMatches(data.matches ?? []);
        setCursor(0);
      } catch {
        if (alive) {
          setTeams([]);
          setMatches([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, query ? 160 : 0);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [query, open]);

  const go = useCallback(
    (hit: Hit) => {
      const trimmed = query.trim();
      if (trimmed) {
        pushRecent(trimmed);
        setRecents(readRecents());
      }
      onClose();
      router.push(
        hit.kind === "team" ? `/football/club/${hit.id}` : `/football/match/${hit.id}`,
      );
    },
    [onClose, query, router],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, Math.max(hits.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter") {
        const hit = hits[cursor];
        if (hit) {
          e.preventDefault();
          go(hit);
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, hits, cursor, go, onClose]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search clubs and matches"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/12 bg-[#0b0d14] shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Search size={17} aria-hidden className="shrink-0 text-foreground/45" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clubs and matches"
            aria-label="Search clubs and matches"
            className="w-full bg-transparent text-base outline-none placeholder:text-foreground/35"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cx("rounded-full bg-white/8 p-1.5 text-foreground/60", focusRing)}
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
          {hits.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-foreground/45">
              {loading
                ? "Searching…"
                : query
                  ? `Nothing matched “${query}”.`
                  : "Type a club or a matchup. Follow clubs and they show up here first."}
              {!query && recents.length > 0 ? (
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {recents.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setQuery(r)}
                      className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-foreground/70 hover:text-foreground"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {teams.length > 0 ? (
            <Section title="Clubs">
              {teams.map((t, i) => (
                <Row
                  key={`t-${t.id}`}
                  index={i}
                  active={cursor === i}
                  onPick={() => go(t)}
                  onHover={() => setCursor(i)}
                >
                  <Crest src={t.crest} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
                  {t.followed ? (
                    <Star size={12} aria-hidden className="shrink-0 fill-primary text-primary" />
                  ) : null}
                  {t.competitionLabel ? (
                    <span className="shrink-0 text-[11px] text-foreground/40">
                      {t.competitionLabel}
                    </span>
                  ) : null}
                </Row>
              ))}
            </Section>
          ) : null}

          {matches.length > 0 ? (
            <Section title="Matches">
              {matches.map((m, i) => {
                const index = teams.length + i;
                return (
                  <Row
                    key={`m-${m.id}`}
                    index={index}
                    active={cursor === index}
                    onPick={() => go(m)}
                    onHover={() => setCursor(index)}
                  >
                    <Crest src={m.home.crest} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold">{m.home.name}</span>
                      <span className="text-foreground/40"> v </span>
                      <span className="font-semibold">{m.away.name}</span>
                    </span>
                    <Crest src={m.away.crest} />
                    <span className="shrink-0 text-[11px] tabular-nums text-foreground/45">
                      {m.score ?? m.date}
                    </span>
                  </Row>
                );
              })}
            </Section>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-foreground/35">
          <span>↑↓ move · ↵ open · esc close</span>
          {loading ? <span>searching…</span> : null}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pb-1">
      <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/35">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  index,
  active,
  onPick,
  onHover,
  children,
}: {
  index: number;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-index={index}
      onClick={onPick}
      onMouseEnter={onHover}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
        active ? "bg-white/10 text-foreground" : "text-foreground/80 hover:bg-white/5",
      )}
    >
      {children}
    </button>
  );
}

function Crest({ src }: { src: string | null }) {
  if (!src) return <span className="size-5 shrink-0 rounded-full bg-white/10" />;
  return (
    <Image
      src={src}
      alt=""
      width={20}
      height={20}
      className="size-5 shrink-0 object-contain"
      unoptimized
    />
  );
}
