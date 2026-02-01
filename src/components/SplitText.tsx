"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { motion, useInView, Variants, useReducedMotion } from "framer-motion";

type AnimationType = "wave" | "fade-blur" | "slide-up" | "scramble" | "stagger";

interface SplitTextProps {
  text: string;
  className?: string;
  animation?: AnimationType;
  delay?: number;
  staggerDelay?: number;
  duration?: number;
  once?: boolean;
  tag?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
  splitBy?: "characters" | "words";
}

const scrambleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";

export default function SplitText({
  text,
  className = "",
  animation = "fade-blur",
  delay = 0,
  staggerDelay = 0.03,
  duration = 0.5,
  once = true,
  tag: Tag = "span",
  splitBy = "characters",
}: SplitTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once, margin: "-50px" });
  const prefersReducedMotion = useReducedMotion();

  // Split text into characters or words
  const parts = useMemo(() => {
    if (splitBy === "words") {
      return text.split(" ").map((word, i) => ({
        text: word + (i < text.split(" ").length - 1 ? "\u00A0" : ""),
        index: i,
      }));
    }
    return text.split("").map((char, i) => ({
      text: char === " " ? "\u00A0" : char,
      index: i,
    }));
  }, [text, splitBy]);

  // Animation variants
  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: delay,
      },
    },
  };

  const getCharVariants = (): Variants => {
    switch (animation) {
      case "wave":
        return {
          hidden: { y: 20, opacity: 0 },
          visible: (i: number) => ({
            y: 0,
            opacity: 1,
            transition: {
              duration,
              delay: delay + Math.sin(i * 0.5) * 0.1,
              ease: [0.25, 0.46, 0.45, 0.94],
            },
          }),
        };
      case "slide-up":
        return {
          hidden: { y: "100%", opacity: 0 },
          visible: {
            y: "0%",
            opacity: 1,
            transition: {
              duration,
              ease: [0.25, 0.46, 0.45, 0.94],
            },
          },
        };
      case "fade-blur":
      default:
        return {
          hidden: { opacity: 0, filter: "blur(10px)", y: 10 },
          visible: {
            opacity: 1,
            filter: "blur(0px)",
            y: 0,
            transition: {
              duration,
              ease: [0.25, 0.46, 0.45, 0.94],
            },
          },
        };
    }
  };

  // If reduced motion, render plain text
  if (prefersReducedMotion) {
    return <Tag className={className}>{text}</Tag>;
  }

  // Scramble animation uses a different approach
  if (animation === "scramble") {
    return (
      <ScrambleText
        text={text}
        className={className}
        delay={delay}
        isInView={isInView}
      />
    );
  }

  return (
    <motion.span
      ref={ref}
      className={`inline-block ${className}`}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      aria-label={text}
    >
      {parts.map((part, i) => (
        <span
          key={i}
          className="inline-block overflow-hidden"
          style={{ lineHeight: "1.1em" }}
        >
          <motion.span
            className="inline-block"
            variants={getCharVariants()}
            custom={i}
            style={{ display: "inline-block" }}
          >
            {part.text}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

// Scramble text component
interface ScrambleTextProps {
  text: string;
  className?: string;
  delay?: number;
  tag?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
  isInView: boolean;
  ref?: React.RefObject<HTMLSpanElement | null>;
}

function ScrambleText({ text, className = "", delay = 0, isInView }: ScrambleTextProps) {
  const [displayText, setDisplayText] = useState(text.replace(/./g, "_"));
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (!isInView || hasAnimated) return;

    const delayTimeout = setTimeout(() => {
      setHasAnimated(true);
      let iteration = 0;
      const maxIterations = text.length * 3;

      const interval = setInterval(() => {
        setDisplayText(
          text
            .split("")
            .map((char, index) => {
              if (char === " ") return " ";
              if (index < iteration / 3) return text[index];
              return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
            })
            .join("")
        );

        iteration += 1;

        if (iteration >= maxIterations) {
          clearInterval(interval);
          setDisplayText(text);
        }
      }, 30);

      return () => clearInterval(interval);
    }, delay * 1000);

    return () => clearTimeout(delayTimeout);
  }, [isInView, text, delay, hasAnimated]);

  return (
    <span className={className}>
      {displayText}
    </span>
  );
}

// Animated headline with word-by-word reveal
interface AnimatedHeadlineProps {
  text: string;
  className?: string;
  delay?: number;
}

export function AnimatedHeadline({ text, className = "", delay = 0 }: AnimatedHeadlineProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const prefersReducedMotion = useReducedMotion();

  const words = text.split(" ");

  if (prefersReducedMotion) {
    return <h1 className={className}>{text}</h1>;
  }

  return (
    <motion.h1
      ref={ref}
      className={className}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.1,
            delayChildren: delay,
          },
        },
      }}
    >
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden mr-[0.25em]">
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: "100%", opacity: 0, rotateX: -45 },
              visible: {
                y: "0%",
                opacity: 1,
                rotateX: 0,
                transition: {
                  duration: 0.6,
                  ease: [0.25, 0.46, 0.45, 0.94],
                },
              },
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </motion.h1>
  );
}
