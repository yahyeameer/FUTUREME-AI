"use client";

import { motion, type HTMLMotionProps } from "motion/react";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 14, filter: "blur(4px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.2, 0.7, 0.2, 1] as const } } };

/** Staggered entrance for a group of surfaces. */
export function Reveal({ children, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" {...props}>
      {children}
    </motion.div>
  );
}

export function RevealItem({ as = "div", children, ...props }: HTMLMotionProps<"div"> & { as?: "div" | "section" | "header" | "article" }) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp variants={item} {...props}>
      {children}
    </Comp>
  );
}
