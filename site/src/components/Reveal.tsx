import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Scroll-triggered reveal. `MotionConfig reducedMotion="user"` (see App.tsx)
 * automatically drops transform animation for users who ask for less motion.
 */
export function Reveal({
  children,
  delay = 0,
  y = 20,
  className,
  amount = 0.2,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
