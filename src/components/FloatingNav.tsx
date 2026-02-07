"use client";

import { useState } from "react";
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import MagneticElement from "./MagneticElement";

interface FloatingNavProps {
  showAfterScroll?: number;
  className?: string;
}

export default function FloatingNav({
  showAfterScroll = 400,
  className = "",
}: FloatingNavProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isScrollingDown, setIsScrollingDown] = useState(true);
  const { scrollY, scrollYProgress } = useScroll();
  const pathname = usePathname();
  const isBrokePage = pathname?.startsWith("/broke");

  useMotionValueEvent(scrollY, "change", (current) => {
    const diff = current - lastScrollY;

    if (Math.abs(diff) > 5) {
      setIsScrollingDown(diff > 0);
      setLastScrollY(current);
    }

    setIsVisible(current > showAfterScroll);
  });

  const shouldShow = isVisible && !isScrollingDown;

  const scrollToContact = () => {
    const contactSection = document.getElementById("contact");
    if (contactSection) {
      contactSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.nav
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
          }}
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] ${className}`}
        >
          <div className="glass-nav flex items-center gap-1 px-2 py-2 rounded-full">
            {/* Logo link */}
            <MagneticElement strength={0.2} radius={40}>
              <Link
                href={isBrokePage ? "/broke" : "/"}
                className="px-4 py-2 text-sm font-semibold text-white hover:text-[#C4A35A] transition-colors duration-300 flex items-center"
              >
                {isBrokePage ? (
                  <Image
                    src="/broke/logo.svg"
                    alt="BROKE"
                    width={24}
                    height={25}
                    className="hover:brightness-110 transition-all"
                  />
                ) : (
                  "7F"
                )}
              </Link>
            </MagneticElement>

            {/* Divider */}
            <div className="w-px h-4 bg-white/10" />

            {/* Services */}
            <MagneticElement strength={0.2} radius={40}>
              <Link
                href="/services"
                className={`nav-item px-4 py-2 text-sm transition-colors duration-300 rounded-full hover:bg-white/5 ${
                  pathname === "/services" ? "text-[#C4A35A]" : "text-white/70 hover:text-white"
                }`}
              >
                Services
              </Link>
            </MagneticElement>

            {/* Divider */}
            <div className="w-px h-4 bg-white/10" />

            {/* Contact */}
            <MagneticElement strength={0.2} radius={40}>
              <button
                onClick={scrollToContact}
                className="nav-item px-4 py-2 text-sm text-white/70 hover:text-white transition-colors duration-300 rounded-full hover:bg-white/5"
              >
                Contact
              </button>
            </MagneticElement>

            {/* Progress indicator */}
            <div className="ml-2 w-8 h-8 relative">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="2"
                />
                <motion.circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="#C4A35A"
                  strokeWidth="2"
                  strokeLinecap="round"
                  style={{
                    pathLength: scrollYProgress,
                  }}
                  strokeDasharray="100"
                  strokeDashoffset="0"
                />
              </svg>
            </div>
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
