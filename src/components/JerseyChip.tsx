export function JerseyChip({ number }: { number: string | null }) {
  if (!number) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/8 border border-white/10 px-2 py-0.5 text-[11px] font-mono tabular-nums text-foreground/80">
      #{number}
    </span>
  );
}
