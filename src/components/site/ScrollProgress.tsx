"use client";

import { motion, useScroll, useSpring, useTransform } from "motion/react";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 22,
    restDelta: 0.001,
  });
  const glowOpacity = useTransform(scrollYProgress, [0, 0.05], [0, 1]);

  return (
    <motion.div
      aria-hidden
      style={{ scaleX, opacity: glowOpacity }}
      className="fixed top-0 left-0 right-0 h-[3px] origin-left z-50 pointer-events-none"
    >
      <div
        className="h-full w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, #FFB800 25%, #FFD54B 50%, #FFB800 75%, transparent 100%)",
          boxShadow: "0 0 16px 2px rgba(255, 184, 0, 0.6)",
        }}
      />
    </motion.div>
  );
}
