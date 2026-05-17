// Shared handle rules so the API validator, the onboarding form, and the
// availability check all agree on the same shape.

import { z } from "zod";

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;
export const HANDLE_REGEX = /^[a-z0-9_]+$/;

export const HandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(HANDLE_MIN, { message: `min ${HANDLE_MIN} chars` })
  .max(HANDLE_MAX, { message: `max ${HANDLE_MAX} chars` })
  .regex(HANDLE_REGEX, { message: "letters, numbers, underscore only" });

export function suggestHandle(seed: string): string {
  const base = seed
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, HANDLE_MAX);
  if (base.length >= HANDLE_MIN) return base;
  return `bro_${Math.random().toString(36).slice(2, 8)}`;
}
