"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type CommonProps = {
  children: React.ReactNode;
  className?: string;
  withLock?: boolean;
  size?: "md" | "lg";
  variant?: "solid" | "outline";
};

type Props = CommonProps &
  (
    | { href: string; onClick?: never; type?: never; disabled?: never }
    | {
        href?: never;
        onClick?: () => void;
        type?: "button" | "submit";
        disabled?: boolean;
      }
  );

const sizes = {
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-[15px]",
};

export function GoldButton({
  children,
  className,
  href,
  onClick,
  type = "button",
  disabled,
  withLock = false,
  size = "md",
  variant = "solid",
}: Props) {
  const base = cn(
    "group/btn relative inline-flex items-center justify-center gap-2 rounded-full font-bold uppercase tracking-[0.08em] overflow-hidden transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    sizes[size],
    variant === "solid"
      ? "bg-primary text-primary-foreground shadow-[0_8px_28px_-8px_rgba(255,184,0,0.55)] hover:bg-[var(--primary-hover)] hover:-translate-y-[1px] hover:shadow-[0_14px_36px_-10px_rgba(255,184,0,0.7)]"
      : "border border-primary/40 text-foreground hover:bg-primary/10 hover:border-primary/70",
    disabled && "opacity-50 pointer-events-none",
    className
  );

  const inner = (
    <>
      <span className="relative z-10 flex items-center gap-2">
        {children}
        {withLock && (
          <Lock
            size={14}
            strokeWidth={2.5}
            className="lock-wiggle"
          />
        )}
      </span>
      {variant === "solid" && (
        <span
          aria-hidden
          className="absolute inset-0 z-0 opacity-0 group-hover/btn:opacity-100 gold-sweep pointer-events-none"
        />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={base}>
      {inner}
    </button>
  );
}
