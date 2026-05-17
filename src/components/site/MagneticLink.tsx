"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import { useRef } from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  strength?: number;
};

export function MagneticLink({
  children,
  className,
  strength = 0.25,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      className={className}
      onPointerMove={(e) => {
        const node = ref.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        x.set((e.clientX - rect.left - rect.width / 2) * strength);
        y.set((e.clientY - rect.top - rect.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
