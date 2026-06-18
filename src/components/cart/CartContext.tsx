"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";

export type NbaCartPick = {
  sport: "nba";
  prediction_id: string;
  game_id: number;
  player_id: number;
  player_first_name: string;
  player_last_name: string;
  team_id: number | null;
  team_abbreviation: string | null;
  market: string;
  line: number;
  pick: "over" | "under";
  confidence: number;
  jersey_number: string | null;
};

export type SoccerCartPick = {
  sport: "soccer";
  prediction_id: string;
  match_id: number;
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  confidence: number;
  best_odds: number;
  home: string;
  away: string;
  home_abbr: string;
  away_abbr: string;
};

// A coupon is single-sport (NBA player props and soccer match markets settle
// and price differently), so picks always share one `sport` discriminator.
export type CartPick = NbaCartPick | SoccerCartPick;

export type CartMode = "power" | "flex";

type CartState = {
  picks: CartPick[];
  stake: number;
  mode: CartMode;
  isOpen: boolean;
};

type CartContextValue = CartState & {
  hydrated: boolean;
  // The sport of the picks currently in the coupon, or null when empty.
  sport: "nba" | "soccer" | null;
  add: (pick: CartPick) => { ok: boolean; reason?: string };
  remove: (predictionId: string) => void;
  clear: () => void;
  setStake: (stake: number) => void;
  setMode: (mode: CartMode) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  has: (predictionId: string) => boolean;
  sameGameConflict: (gameId: number, predictionId?: string) => boolean;
};

const STORAGE_KEY = "tmb:cart:v1";
const MAX_PICKS = 6;

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [picks, setPicks] = useState<CartPick[]>([]);
  const [stake, setStakeState] = useState<number>(10);
  const [mode, setModeState] = useState<CartMode>("power");
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // One-shot localStorage hydration. We can't use a lazy useState
    // initializer because the provider also renders on the server (Next.js
    // client component) — `window` is undefined there, and even if we
    // guarded, the resulting server/client mismatch would break hydration.
    // Reading after mount is the safe pattern.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CartState>;
        if (Array.isArray(parsed.picks)) {
          // Carts saved before soccer shipped have no `sport` field — they're
          // all NBA. Backfill the discriminator so older localStorage stays
          // valid against the new union shape.
          const migrated = parsed.picks.map((p) =>
            p && (p as CartPick).sport === "soccer"
              ? (p as CartPick)
              : ({ ...(p as object), sport: "nba" } as CartPick),
          );
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPicks(migrated.slice(0, MAX_PICKS));
        }
        if (typeof parsed.stake === "number" && parsed.stake > 0) {
          setStakeState(parsed.stake);
        }
        if (parsed.mode === "power" || parsed.mode === "flex") {
          setModeState(parsed.mode);
        }
      }
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ picks, stake, mode } satisfies Omit<CartState, "isOpen">),
      );
    } catch {
      // quota / disabled — ignore
    }
  }, [picks, stake, mode, hydrated]);

  const has = useCallback(
    (predictionId: string) => picks.some((p) => p.prediction_id === predictionId),
    [picks],
  );

  // Kept on the context surface so existing call sites compile, but the
  // same-game restriction was removed — users can now build same-game
  // parlays (SGPs). Returns false unconditionally; predictionId is only
  // accepted to preserve the signature for any external caller.
  const sameGameConflict = useCallback(
    (_gameId: number, _predictionId?: string) => {
      void _gameId;
      void _predictionId;
      return false;
    },
    [],
  );

  const add = useCallback(
    (pick: CartPick): { ok: boolean; reason?: string } => {
      if (picks.some((p) => p.prediction_id === pick.prediction_id)) {
        return { ok: true };
      }
      if (picks.length >= MAX_PICKS) {
        return { ok: false, reason: `Coupons cap at ${MAX_PICKS} picks.` };
      }
      // A coupon can't mix sports — they price and settle on different rails.
      if (picks.length > 0 && picks[0].sport !== pick.sport) {
        return {
          ok: false,
          reason:
            pick.sport === "soccer"
              ? "Coupon already has NBA picks. Clear it to start a football one."
              : "Coupon already has football picks. Clear it to start an NBA one.",
        };
      }
      setPicks((prev) => [...prev, pick]);
      return { ok: true };
    },
    [picks],
  );

  const remove = useCallback((predictionId: string) => {
    setPicks((prev) => prev.filter((p) => p.prediction_id !== predictionId));
  }, []);

  const clear = useCallback(() => setPicks([]), []);

  const setStake = useCallback((value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    setStakeState(Math.min(value, 10000));
  }, []);

  const setMode = useCallback((value: CartMode) => setModeState(value), []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const value = useMemo<CartContextValue>(
    () => ({
      picks,
      stake,
      mode,
      isOpen,
      hydrated,
      sport: picks.length > 0 ? picks[0].sport : null,
      add,
      remove,
      clear,
      setStake,
      setMode,
      open,
      close,
      toggle,
      has,
      sameGameConflict,
    }),
    [
      picks,
      stake,
      mode,
      isOpen,
      hydrated,
      add,
      remove,
      clear,
      setStake,
      setMode,
      open,
      close,
      toggle,
      has,
      sameGameConflict,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return ctx;
}

export function combinedConfidence(picks: CartPick[]): number {
  if (picks.length < 2) return 0;
  const product = picks.reduce((acc, p) => acc * (p.confidence / 100), 1);
  return Math.floor(product * 1000) / 10;
}
