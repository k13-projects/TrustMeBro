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

export type CartPick = {
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

export type CartMode = "power" | "flex";

type CartState = {
  picks: CartPick[];
  stake: number;
  mode: CartMode;
  isOpen: boolean;
};

type CartContextValue = CartState & {
  hydrated: boolean;
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
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPicks(parsed.picks.slice(0, MAX_PICKS));
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

  const sameGameConflict = useCallback(
    (gameId: number, predictionId?: string) =>
      picks.some(
        (p) => p.game_id === gameId && p.prediction_id !== predictionId,
      ),
    [picks],
  );

  const add = useCallback(
    (pick: CartPick): { ok: boolean; reason?: string } => {
      if (picks.some((p) => p.prediction_id === pick.prediction_id)) {
        return { ok: true };
      }
      if (picks.length >= MAX_PICKS) {
        return { ok: false, reason: `Coupons cap at ${MAX_PICKS} picks.` };
      }
      if (picks.some((p) => p.game_id === pick.game_id)) {
        return { ok: false, reason: "Only one pick per game in a coupon." };
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
