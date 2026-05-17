import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** rotate degrees for orientation */
  rotate?: number;
};

/**
 * Hand-drawn curvy yellow arrow accent used in marketing sections (e.g., the
 * pricing section in the mockup pointing from "EDGE" toward the Monthly tier).
 */
export function HandArrow({ className, rotate = 0 }: Props) {
  return (
    <svg
      viewBox="0 0 220 140"
      className={cn("text-primary", className)}
      style={{ transform: `rotate(${rotate}deg)` }}
      aria-hidden
      fill="none"
    >
      <path
        d="M14 24
           C 70 6, 130 14, 168 60
           C 184 80, 188 100, 178 120"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="0 1"
      />
      {/* arrowhead */}
      <path
        d="M168 108 L 178 124 L 196 116"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
