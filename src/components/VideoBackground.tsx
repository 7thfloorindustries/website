"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";

interface VideoBackgroundProps {
  videoSrc?: string;
  posterSrc?: string;
  fallbackImageSrc?: string;
  opacity?: number;
  grayscale?: boolean;
  kenBurns?: boolean;
  overlay?: boolean;
  overlayOpacity?: number;
  className?: string;
}

export default function VideoBackground({
  videoSrc,
  posterSrc,
  fallbackImageSrc = "/7thfloor.png",
  opacity = 0.25,
  grayscale = true,
  kenBurns = true,
  overlay = true,
  overlayOpacity = 0.6,
  className = "",
}: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [isLowPowerMode, setIsLowPowerMode] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check for reduced motion preference
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(motionQuery.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    motionQuery.addEventListener("change", handleMotionChange);

    // Check for low power mode / slow connection
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") {
      setIsLowPowerMode(true);
    }

    // Check for mobile devices (often have limited video performance)
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      setIsLowPowerMode(true);
    }

    return () => {
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current || !videoSrc || isLowPowerMode) return;

    const video = videoRef.current;

    const handleCanPlay = () => {
      setIsVideoLoaded(true);
      video.play().catch(() => {
        // Autoplay blocked, fallback to image
        setHasVideoError(true);
      });
    };

    const handleError = () => {
      setHasVideoError(true);
    };

    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("error", handleError);
    };
  }, [videoSrc, isLowPowerMode]);

  // Show fallback image if no video, video error, low power, or reduced motion
  const showFallback = !videoSrc || hasVideoError || isLowPowerMode || prefersReducedMotion;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/* Video */}
      {videoSrc && !showFallback && (
        <motion.video
          ref={videoRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: isVideoLoaded ? opacity : 0 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className={`absolute inset-0 w-full h-full object-cover ${grayscale ? "grayscale" : ""}`}
          style={{
            filter: grayscale ? "grayscale(100%) contrast(1.1)" : undefined,
          }}
          muted
          loop
          playsInline
          poster={posterSrc}
        >
          <source src={videoSrc} type="video/mp4" />
        </motion.video>
      )}

      {/* Fallback Image with Ken Burns effect */}
      {showFallback && fallbackImageSrc && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="absolute inset-0"
        >
          <motion.div
            animate={
              kenBurns && !prefersReducedMotion
                ? {
                    scale: [1, 1.1, 1.05, 1.1, 1],
                    x: [0, 20, -10, 15, 0],
                    y: [0, -10, 15, -5, 0],
                  }
                : {}
            }
            transition={
              kenBurns && !prefersReducedMotion
                ? {
                    duration: 30,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
                : {}
            }
            className="absolute inset-0"
          >
            <Image
              src={fallbackImageSrc}
              alt=""
              fill
              className={`object-cover ${grayscale ? "grayscale" : ""}`}
              style={{
                opacity,
                filter: grayscale ? "grayscale(100%) contrast(1.1)" : undefined,
              }}
              priority
            />
          </motion.div>
        </motion.div>
      )}

      {/* Dark gradient overlay */}
      {overlay && (
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(to bottom,
                rgba(10, 10, 10, ${overlayOpacity}) 0%,
                rgba(10, 10, 10, ${overlayOpacity * 0.5}) 50%,
                rgba(10, 10, 10, ${overlayOpacity}) 100%
              )
            `,
          }}
        />
      )}

      {/* Vignette effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(10, 10, 10, 0.8) 100%)`,
        }}
      />

      {/* Gold tint overlay (very subtle) */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-overlay"
        style={{
          background: `radial-gradient(ellipse at 70% 30%, rgba(196, 163, 90, 0.1) 0%, transparent 60%)`,
        }}
      />
    </div>
  );
}
