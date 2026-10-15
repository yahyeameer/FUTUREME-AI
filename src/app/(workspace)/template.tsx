"use client";

import { motion } from "motion/react";

// A short entrance on each navigation; skipped entirely when reduced motion is on.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div className="flex min-w-0 flex-1 flex-col" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}
