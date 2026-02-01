"use client";

import { useState, useEffect, useCallback } from "react";

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";

interface TextScrambleProps {
  text: string;
  className?: string;
  href?: string;
}

export default function TextScramble({ text, className = "", href }: TextScrambleProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isHovering, setIsHovering] = useState(false);

  const scramble = useCallback(() => {
    let iteration = 0;
    const maxIterations = text.length * 3;

    const interval = setInterval(() => {
      setDisplayText(
        text
          .split("")
          .map((char, index) => {
            if (char === " " || char === "@" || char === ".") return char;
            if (index < iteration / 3) return text[index];
            return chars[Math.floor(Math.random() * chars.length)];
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
  }, [text]);

  useEffect(() => {
    if (isHovering) {
      const cleanup = scramble();
      return cleanup;
    } else {
      setDisplayText(text);
    }
  }, [isHovering, scramble, text]);

  const content = (
    <span
      className={`font-mono ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {displayText}
    </span>
  );

  if (href) {
    return (
      <a
        href={href}
        className={className}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {displayText}
      </a>
    );
  }

  return content;
}
