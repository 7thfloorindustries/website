"use client";

import { ReactNode, useRef } from "react";
import { motion, useInView, Variants } from "framer-motion";

interface SectionRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  blur?: boolean;
  staggerChildren?: boolean;
  staggerDelay?: number;
  once?: boolean;
  threshold?: number;
}

const directionOffsets = {
  up: { y: 40, x: 0 },
  down: { y: -40, x: 0 },
  left: { x: 40, y: 0 },
  right: { x: -40, y: 0 },
};

export default function SectionReveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
  blur = true,
  staggerChildren = false,
  staggerDelay = 0.1,
  once = true,
  threshold = 0.2,
}: SectionRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, {
    once,
    margin: "-50px",
    amount: threshold
  });

  const offset = directionOffsets[direction];

  const containerVariants: Variants = {
    hidden: {
      opacity: 0,
      y: offset.y,
      x: offset.x,
      scale: 0.95,
      filter: blur ? "blur(10px)" : "blur(0px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        duration: 0.8,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94],
        staggerChildren: staggerChildren ? staggerDelay : 0,
      },
    },
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={containerVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Stagger child component for use inside SectionReveal
interface StaggerChildProps {
  children: ReactNode;
  className?: string;
  index?: number;
}

export function StaggerChild({ children, className = "", index = 0 }: StaggerChildProps) {
  const childVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 20,
      filter: "blur(4px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        duration: 0.5,
        delay: index * 0.1,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  };

  return (
    <motion.div variants={childVariants} className={className}>
      {children}
    </motion.div>
  );
}

// Mask reveal variant - wipe animation
interface MaskRevealProps {
  children: ReactNode;
  className?: string;
  direction?: "left" | "right" | "top" | "bottom";
  delay?: number;
  once?: boolean;
}

export function MaskReveal({
  children,
  className = "",
  direction = "left",
  delay = 0,
  once = true,
}: MaskRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, margin: "-50px" });

  const clipPaths = {
    left: {
      hidden: "inset(0 100% 0 0)",
      visible: "inset(0 0% 0 0)",
    },
    right: {
      hidden: "inset(0 0 0 100%)",
      visible: "inset(0 0 0 0%)",
    },
    top: {
      hidden: "inset(0 0 100% 0)",
      visible: "inset(0 0 0% 0)",
    },
    bottom: {
      hidden: "inset(100% 0 0 0)",
      visible: "inset(0% 0 0 0)",
    },
  };

  return (
    <motion.div
      ref={ref}
      initial={{ clipPath: clipPaths[direction].hidden }}
      animate={{ clipPath: isInView ? clipPaths[direction].visible : clipPaths[direction].hidden }}
      transition={{
        duration: 0.8,
        delay,
        ease: [0.76, 0, 0.24, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
