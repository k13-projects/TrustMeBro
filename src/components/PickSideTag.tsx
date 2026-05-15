export function PickSideTag({ side }: { side: "over" | "under" }) {
  const isOver = side === "over";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        isOver
          ? "bg-emerald-400/15 text-emerald-300"
          : "bg-rose-400/15 text-rose-300"
      }`}
    >
      <span aria-hidden>{isOver ? "▲" : "▼"}</span>
      {side}
    </span>
  );
}
