"use client";

import { ReactNode, useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export default function PageTransition({ children, className = "" }: PageTransitionProps) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{
          duration: 0.4,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Slide transition variant
export function SlidePageTransition({ children, className = "" }: PageTransitionProps) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -100 }}
        transition={{
          duration: 0.5,
          ease: [0.76, 0, 0.24, 1],
        }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Cover transition with overlay
export function CoverPageTransition({ children, className = "" }: PageTransitionProps) {
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(true);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 800);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <>
      {/* Cover overlay */}
      <AnimatePresence>
        {isTransitioning && (
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            exit={{ scaleY: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.76, 0, 0.24, 1],
            }}
            style={{ originY: 0 }}
            className="fixed inset-0 bg-[#0A0A0A] z-[9999]"
          />
        )}
      </AnimatePresence>

      {/* Page content */}
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className={className}
      >
        {children}
      </motion.div>
    </>
  );
}

// Reveal transition from bottom
export function RevealPageTransition({ children, className = "" }: PageTransitionProps) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <>
      {/* Reveal overlay that slides up */}
      <motion.div
        key={`overlay-${pathname}`}
        initial={{ y: 0 }}
        animate={{ y: "-100%" }}
        transition={{
          duration: 0.6,
          ease: [0.76, 0, 0.24, 1],
          delay: 0.2,
        }}
        className="fixed inset-0 bg-[#0A0A0A] z-[9999] flex items-center justify-center"
      >
        <motion.span
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="text-[#C4A35A] text-lg font-light tracking-wider"
        >
          {getPageName(pathname)}
        </motion.span>
      </motion.div>

      {/* Page content */}
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.6,
          ease: [0.25, 0.46, 0.45, 0.94],
          delay: 0.5,
        }}
        className={className}
      >
        {children}
      </motion.div>
    </>
  );
}

// Helper to get page name for transition label
function getPageName(pathname: string): string {
  const routes: Record<string, string> = {
    "/": "Home",
    "/work": "Work",
    "/about": "About",
    "/services": "Services",
    "/contact": "Contact",
  };

  // Handle dynamic routes
  if (pathname.startsWith("/work/")) {
    return "Case Study";
  }

  return routes[pathname] || "Loading";
}

// Loading indicator component
export function PageLoadingIndicator({ isLoading }: { isLoading: boolean }) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion || !isLoading) return null;

  return (
    <motion.div
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      exit={{ scaleX: 0 }}
      transition={{
        duration: 0.3,
        ease: "easeOut",
      }}
      style={{ originX: 0 }}
      className="fixed top-0 left-0 right-0 h-[2px] bg-[#C4A35A] z-[10000]"
    />
  );
}
