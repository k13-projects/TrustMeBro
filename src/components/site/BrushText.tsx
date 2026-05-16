import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  rotate?: number;
};

/**
 * Brush-stroke painted display word. Use for accent words inside a sans
 * headline (e.g., "TRUST ME <BrushText>BRO</BrushText>"). Backed by the
 * `brush-text` utility in globals.css — Bowlby One + yellow gradient + slight
 * rotation + glow.
 */
export function BrushText({ children, className, rotate }: Props) {
  return (
    <span
      className={cn("brush-text", className)}
      style={
        rotate !== undefined ? { transform: `rotate(${rotate}deg)` } : undefined
      }
    >
      {children}
    </span>
  );
}
