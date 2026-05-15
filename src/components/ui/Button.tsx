import { forwardRef } from "react";
import { cx, disabledStyles, focusRing } from "@/lib/design/tokens";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-white text-[#050508] hover:bg-white/90 active:bg-white/85 border border-transparent",
  secondary:
    "bg-white/10 hover:bg-white/15 border border-white/15 text-foreground",
  ghost: "text-foreground/70 hover:text-foreground hover:bg-white/5",
  danger:
    "bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-100",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-lg",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-11 px-5 text-sm rounded-xl",
};

type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingLabel?: string;
  className?: string;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      loadingLabel,
      disabled,
      fullWidth,
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cx(
          base,
          variants[variant],
          sizes[size],
          focusRing,
          disabledStyles,
          fullWidth && "w-full",
          className,
        )}
        {...rest}
      >
        {loading ? (
          <>
            <Spinner />
            <span>{loadingLabel ?? "Working…"}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

function Spinner() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
