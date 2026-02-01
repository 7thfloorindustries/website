"use client";

import { useRef, useState, useCallback, ReactNode } from "react";
import { motion, useSpring, useMotionValue, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface MagneticButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  loading?: boolean;
  disabled?: boolean;
  magnetic?: boolean;
  ripple?: boolean;
  textScramble?: boolean;
}

interface RippleEffect {
  id: number;
  x: number;
  y: number;
}

const scrambleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export default function MagneticButton({
  children,
  href,
  onClick,
  className = "",
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "right",
  loading = false,
  disabled = false,
  magnetic = true,
  ripple = true,
  textScramble = false,
}: MagneticButtonProps) {
  const ref = useRef<HTMLElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [ripples, setRipples] = useState<RippleEffect[]>([]);
  const [displayText, setDisplayText] = useState<string | null>(null);

  // Magnetic effect
  const x = useSpring(0, { stiffness: 150, damping: 15 });
  const y = useSpring(0, { stiffness: 150, damping: 15 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current || !magnetic || disabled) return;

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const distanceX = e.clientX - centerX;
    const distanceY = e.clientY - centerY;

    x.set(distanceX * 0.3);
    y.set(distanceY * 0.3);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
    setDisplayText(null);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (textScramble && typeof children === "string") {
      scrambleText(children);
    }
  };

  // Text scramble effect
  const scrambleText = useCallback((text: string) => {
    let iteration = 0;
    const maxIterations = text.length * 2;

    const interval = setInterval(() => {
      setDisplayText(
        text
          .split("")
          .map((char, index) => {
            if (char === " ") return " ";
            if (index < iteration / 2) return text[index];
            return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
          })
          .join("")
      );

      iteration += 1;

      if (iteration >= maxIterations) {
        clearInterval(interval);
        setDisplayText(null);
      }
    }, 25);
  }, []);

  // Ripple effect
  const handleClick = (e: React.MouseEvent) => {
    if (disabled || loading) return;

    if (ripple && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const newRipple: RippleEffect = {
        id: Date.now(),
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      setRipples((prev) => [...prev, newRipple]);

      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, 600);
    }

    onClick?.();
  };

  // Variant styles
  const variantStyles = {
    primary:
      "bg-[#C4A35A] text-[#0A0A0A] hover:bg-[#D4B86A] border-transparent",
    secondary:
      "bg-white/10 text-white hover:bg-white/20 border-transparent",
    outline:
      "bg-transparent text-[#C4A35A] border-[#C4A35A] hover:bg-[#C4A35A]/10",
  };

  // Size styles
  const sizeStyles = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  const buttonContent = (
    <motion.span
      ref={ref as React.RefObject<HTMLSpanElement>}
      className={`
        relative inline-flex items-center justify-center gap-2
        font-medium rounded-full border-2 overflow-hidden
        transition-colors duration-300
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${disabled || loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
      style={{ x, y }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
    >
      {/* Loading spinner */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <LoadingSpinner />
          </motion.span>
        )}
      </AnimatePresence>

      {/* Icon left */}
      {icon && iconPosition === "left" && (
        <motion.span
          animate={{ x: isHovered ? -3 : 0 }}
          transition={{ duration: 0.2 }}
          className={loading ? "opacity-0" : ""}
        >
          {icon}
        </motion.span>
      )}

      {/* Text content */}
      <span className={loading ? "opacity-0" : ""}>
        {displayText || children}
      </span>

      {/* Icon right */}
      {icon && iconPosition === "right" && (
        <motion.span
          animate={{ x: isHovered ? 3 : 0 }}
          transition={{ duration: 0.2 }}
          className={loading ? "opacity-0" : ""}
        >
          {icon}
        </motion.span>
      )}

      {/* Arrow icon that slides in on hover */}
      {!icon && (
        <motion.span
          initial={{ opacity: 0, x: -10 }}
          animate={{
            opacity: isHovered && !loading ? 1 : 0,
            x: isHovered && !loading ? 0 : -10,
          }}
          transition={{ duration: 0.2 }}
          className={`${loading ? "hidden" : ""}`}
        >
          <ArrowIcon />
        </motion.span>
      )}

      {/* Ripple effects */}
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            initial={{ scale: 0, opacity: 0.5 }}
            animate={{ scale: 4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute w-10 h-10 rounded-full pointer-events-none"
            style={{
              left: ripple.x - 20,
              top: ripple.y - 20,
              backgroundColor:
                variant === "primary" ? "rgba(10, 10, 10, 0.3)" : "rgba(196, 163, 90, 0.3)",
            }}
          />
        ))}
      </AnimatePresence>
    </motion.span>
  );

  if (href && !disabled && !loading) {
    return <Link href={href}>{buttonContent}</Link>;
  }

  return buttonContent;
}

// Loading spinner component
function LoadingSpinner() {
  return (
    <svg
      className="animate-spin w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// Arrow icon component
function ArrowIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 8l4 4m0 0l-4 4m4-4H3"
      />
    </svg>
  );
}
