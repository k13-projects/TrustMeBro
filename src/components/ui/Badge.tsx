import { cx, toneTokens, type Tone } from "@/lib/design/tokens";

type BadgeProps = {
  tone?: Tone;
  size?: "sm" | "md";
  bordered?: boolean;
  className?: string;
  children: React.ReactNode;
};

const sizes = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-[11px]",
};

export function Badge({
  tone = "neutral",
  size = "md",
  bordered = false,
  className,
  children,
}: BadgeProps) {
  const t = toneTokens[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full font-medium uppercase tracking-wider",
        sizes[size],
        t.fg,
        t.bg,
        bordered && "border",
        bordered && t.border,
        className,
      )}
    >
      {children}
    </span>
  );
}
