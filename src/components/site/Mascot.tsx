"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  size?: number;
  className?: string;
  priority?: boolean;
  bob?: boolean;
  variant?: "full" | "badge";
};

export function Mascot({
  size = 320,
  className,
  priority = false,
  bob = false,
  variant = "full",
}: Props) {
  const src =
    variant === "full" ? "/Design/mascot-hero.png" : "/Design/Logo 2.png";
  return (
    <Image
      src={src}
      alt="TrustMeBro mascot"
      width={size}
      height={size}
      priority={priority}
      className={cn(
        "select-none drop-shadow-[0_20px_50px_rgba(255,184,0,0.25)]",
        bob && "mascot-bob",
        className
      )}
    />
  );
}
