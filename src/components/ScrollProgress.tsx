"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform, useMotionValueEvent, useReducedMotion } from "framer-motion";

interface Section {
  id: string;
  label: string;
}

interface ScrollProgressProps {
  sections?: Section[];
  className?: string;
  position?: "left" | "right";
}

const defaultSections: Section[] = [
  { id: "hero", label: "01" },
  { id: "work", label: "02" },
  { id: "about", label: "03" },
  { id: "contact", label: "04" },
];

export default function ScrollProgress({
  sections = defaultSections,
  className = "",
  position = "left",
}: ScrollProgressProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const { scrollYProgress, scrollY } = useScroll();
  const prefersReducedMotion = useReducedMotion();

  // Show after scrolling past hero
  useMotionValueEvent(scrollY, "change", (value) => {
    setIsVisible(value > 400);
  });

  // Track active section
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const index = Math.floor(value * sections.length);
    setActiveIndex(Math.min(Math.max(0, index), sections.length - 1));
  });

  // Calculate line height based on progress
  const lineHeight = useTransform(
    scrollYProgress,
    [0, 1],
    ["0%", "100%"]
  );

  if (prefersReducedMotion) return null;

  const positionStyles = position === "left" ? "left-6" : "right-6";

  return (
    <motion.div
      initial={{ opacity: 0, x: position === "left" ? -20 : 20 }}
      animate={{
        opacity: isVisible ? 1 : 0,
        x: isVisible ? 0 : position === "left" ? -20 : 20,
      }}
      transition={{ duration: 0.4 }}
      className={`fixed top-1/2 -translate-y-1/2 z-50 hidden lg:block ${positionStyles} ${className}`}
    >
      <div className="relative flex flex-col items-center gap-0">
        {/* Vertical line background */}
        <div className="absolute left-1/2 -translate-x-1/2 top-0 w-px h-full bg-white/10" />

        {/* Animated progress line */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 top-0 w-px bg-[#C4A35A] origin-top"
          style={{ height: lineHeight }}
        />

        {/* Section markers */}
        {sections.map((section, index) => (
          <button
            key={section.id}
            onClick={() => {
              const element = document.getElementById(section.id);
              element?.scrollIntoView({ behavior: "smooth" });
            }}
            className="group relative py-6 flex items-center"
            aria-label={`Go to ${section.label}`}
          >
            {/* Marker dot */}
            <motion.div
              className="relative z-10 w-3 h-3 rounded-full border-2 transition-colors duration-300"
              animate={{
                borderColor: activeIndex >= index ? "#C4A35A" : "rgba(255,255,255,0.2)",
                backgroundColor: activeIndex === index ? "#C4A35A" : "transparent",
              }}
            />

            {/* Label */}
            <motion.span
              className={`absolute text-xs font-medium transition-all duration-300 ${
                position === "left" ? "left-6" : "right-6"
              }`}
              animate={{
                color: activeIndex === index ? "#C4A35A" : "rgba(255,255,255,0.3)",
                opacity: activeIndex === index ? 1 : 0.5,
              }}
            >
              {section.label}
            </motion.span>

            {/* Hover line */}
            <motion.div
              className={`absolute h-px bg-white/30 transition-all duration-300 ${
                position === "left" ? "left-5" : "right-5"
              }`}
              initial={{ width: 0 }}
              whileHover={{ width: 12 }}
            />
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// Minimal horizontal progress bar
export function HorizontalScrollProgress({ className = "" }: { className?: string }) {
  const { scrollYProgress } = useScroll();
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) return null;

  return (
    <motion.div
      className={`fixed top-0 left-0 right-0 h-[2px] bg-[#C4A35A] origin-left z-[100] ${className}`}
      style={{ scaleX: scrollYProgress }}
    />
  );
}

// Circular progress indicator
export function CircularScrollProgress({
  size = 48,
  strokeWidth = 2,
  className = "",
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const { scrollYProgress } = useScroll();
  const prefersReducedMotion = useReducedMotion();

  const circumference = 2 * Math.PI * ((size - strokeWidth) / 2);
  const strokeDashoffset = useTransform(
    scrollYProgress,
    [0, 1],
    [circumference, 0]
  );

  if (prefersReducedMotion) return null;

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {/* Background circle */}
      <svg
        className="absolute inset-0 -rotate-90"
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - strokeWidth) / 2}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={(size - strokeWidth) / 2}
          fill="none"
          stroke="#C4A35A"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
          }}
        />
      </svg>

      {/* Center percentage */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center text-xs font-medium text-[#C4A35A]"
      >
        <PercentageDisplay progress={scrollYProgress} />
      </motion.div>
    </div>
  );
}

// Helper component to display percentage
function PercentageDisplay({ progress }: { progress: ReturnType<typeof useScroll>["scrollYProgress"] }) {
  const [percentage, setPercentage] = useState(0);

  useMotionValueEvent(progress, "change", (value) => {
    setPercentage(Math.round(value * 100));
  });

  return <span>{percentage}%</span>;
}
