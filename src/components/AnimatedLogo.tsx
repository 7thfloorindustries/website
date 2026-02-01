"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import MagneticElement from "./MagneticElement";

interface AnimatedLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  href?: string;
  animate?: boolean;
}

export default function AnimatedLogo({
  className = "",
  size = "md",
  href = "/",
  animate = true,
}: AnimatedLogoProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const sizes = {
    sm: { width: 80, height: 24, fontSize: 12 },
    md: { width: 120, height: 32, fontSize: 14 },
    lg: { width: 160, height: 40, fontSize: 16 },
  };

  const { width, height, fontSize } = sizes[size];

  // If reduced motion, show static logo
  if (prefersReducedMotion || !animate) {
    return (
      <Link href={href} className={className}>
        <span
          className="text-white hover:text-[#C4A35A] transition-colors duration-300 font-semibold tracking-[0.2em]"
          style={{ fontSize }}
        >
          7TH FLOOR DIGITAL
        </span>
      </Link>
    );
  }

  return (
    <MagneticElement strength={0.2} radius={80}>
      <Link
        href={href}
        className={`block ${className}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <svg
          width={width}
          height={height}
          viewBox="0 0 200 50"
          className="overflow-visible"
        >
          {/* Background glow on hover */}
          <motion.rect
            x="-10"
            y="-5"
            width="220"
            height="60"
            fill="url(#logoGlow)"
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 0.5 : 0 }}
            transition={{ duration: 0.3 }}
          />

          {/* Main text "7F" with animated stroke */}
          <g transform="translate(0, 35)">
            {/* "7" character */}
            <motion.path
              d="M0 0 L30 0 L30 8 L15 8 L15 40"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: hasAnimated ? 1 : 0,
                opacity: hasAnimated ? 1 : 0,
                stroke: isHovered ? "#C4A35A" : "white",
              }}
              transition={{
                pathLength: { duration: 0.8, ease: "easeOut", delay: 0 },
                opacity: { duration: 0.2 },
                stroke: { duration: 0.3 },
              }}
              onAnimationComplete={() => setHasAnimated(true)}
            />

            {/* "T" character - simplified */}
            <motion.path
              d="M45 0 L75 0 M60 0 L60 40"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: hasAnimated ? 1 : 0,
                opacity: hasAnimated ? 1 : 0,
                stroke: isHovered ? "#C4A35A" : "white",
              }}
              transition={{
                pathLength: { duration: 0.6, ease: "easeOut", delay: 0.1 },
                opacity: { duration: 0.2, delay: 0.1 },
                stroke: { duration: 0.3 },
              }}
            />

            {/* "H" character */}
            <motion.path
              d="M90 0 L90 40 M90 20 L115 20 M115 0 L115 40"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: hasAnimated ? 1 : 0,
                opacity: hasAnimated ? 1 : 0,
                stroke: isHovered ? "#C4A35A" : "white",
              }}
              transition={{
                pathLength: { duration: 0.7, ease: "easeOut", delay: 0.2 },
                opacity: { duration: 0.2, delay: 0.2 },
                stroke: { duration: 0.3 },
              }}
            />

            {/* "F" character */}
            <motion.path
              d="M130 0 L160 0 M130 0 L130 40 M130 20 L155 20"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: hasAnimated ? 1 : 0,
                opacity: hasAnimated ? 1 : 0,
                stroke: isHovered ? "#C4A35A" : "white",
              }}
              transition={{
                pathLength: { duration: 0.6, ease: "easeOut", delay: 0.3 },
                opacity: { duration: 0.2, delay: 0.3 },
                stroke: { duration: 0.3 },
              }}
            />
          </g>

          {/* Gold underline that draws in */}
          <motion.line
            x1="0"
            y1="48"
            x2="170"
            y2="48"
            stroke="#C4A35A"
            strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: hasAnimated ? 1 : 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
          />

          {/* Glow gradient definition */}
          <defs>
            <radialGradient id="logoGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#C4A35A" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#C4A35A" stopOpacity="0" />
            </radialGradient>
          </defs>
        </svg>

        {/* Trigger animation on mount */}
        <TriggerAnimation onTrigger={() => setHasAnimated(true)} />
      </Link>
    </MagneticElement>
  );
}

// Component to trigger animation after mount
function TriggerAnimation({ onTrigger }: { onTrigger: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onTrigger, 100);
    return () => clearTimeout(timer);
  }, [onTrigger]);

  return null;
}

// Simple text-based animated logo alternative
export function AnimatedTextLogo({
  className = "",
  size = "md",
  href = "/",
}: AnimatedLogoProps) {
  const [isHovered, setIsHovered] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const fontSizes = {
    sm: "12px",
    md: "14px",
    lg: "16px",
  };

  const letters = "7TH FLOOR DIGITAL".split("");

  if (prefersReducedMotion) {
    return (
      <Link href={href} className={className}>
        <span
          className="text-white hover:text-[#C4A35A] transition-colors duration-300 font-semibold tracking-[0.2em]"
          style={{ fontSize: fontSizes[size] }}
        >
          7TH FLOOR DIGITAL
        </span>
      </Link>
    );
  }

  return (
    <MagneticElement strength={0.2} radius={80}>
      <Link
        href={href}
        className={`block ${className}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <motion.span
          className="inline-flex font-semibold tracking-[0.2em]"
          style={{ fontSize: fontSizes[size] }}
        >
          {letters.map((letter, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                color: isHovered ? "#C4A35A" : "#ffffff",
              }}
              transition={{
                opacity: { delay: i * 0.03, duration: 0.3 },
                y: { delay: i * 0.03, duration: 0.3 },
                color: { duration: 0.2 },
              }}
              className="inline-block"
              style={{ marginRight: letter === " " ? "0.3em" : 0 }}
            >
              {letter === " " ? "\u00A0" : letter}
            </motion.span>
          ))}
        </motion.span>
      </Link>
    </MagneticElement>
  );
}
