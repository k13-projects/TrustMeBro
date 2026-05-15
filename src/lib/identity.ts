import "server-only";

import { cookies } from "next/headers";
import { createSupabaseServerClient } from "./supabase/server";

export const GUEST_COOKIE = "tmb_guest_name";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

// Allow letters (incl. accents), numbers, spaces, dashes, underscores, dots.
// 1–24 chars after trim. Tighten if abuse appears.
const NAME_RE = /^[\p{L}\p{N}_.\- ]{1,24}$/u;

export type Requester =
  | { kind: "auth"; user_id: string; display_name: string }
  | { kind: "guest"; guest_name: string; display_name: string }
  | null;

export function normalizeGuestName(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(trimmed)) return null;
  return trimmed;
}

export function guestKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Resolve the current requester, preferring a real Supabase auth session over
 * the guest cookie. Returns null when neither is present.
 *
 * Callers that mutate data should branch on `kind`:
 *  - kind === "auth"  → use the server client (RLS keys on auth.uid())
 *  - kind === "guest" → use the admin client and set guest_name on the row
 */
export async function getRequester(): Promise<Requester> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const meta = (user.user_metadata ?? {}) as {
      full_name?: string;
      name?: string;
      email?: string;
    };
    const display =
      meta.full_name?.trim() ||
      meta.name?.trim() ||
      (user.email ? user.email.split("@")[0] : "Player");
    return { kind: "auth", user_id: user.id, display_name: display };
  }

  const store = await cookies();
  const raw = store.get(GUEST_COOKIE)?.value;
  if (!raw) return null;
  const name = normalizeGuestName(raw);
  if (!name) return null;
  return { kind: "guest", guest_name: name, display_name: name };
}
