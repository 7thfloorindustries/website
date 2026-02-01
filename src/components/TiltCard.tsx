"use client";

import { ReactNode, useRef, useState, useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  tiltAmount?: number;
  scale?: number;
  perspective?: number;
  glare?: boolean;
  glareOpacity?: number;
}

export default function TiltCard({
  children,
  className = "",
  tiltAmount = 10,
  scale = 1.02,
  perspective = 1000,
  glare = true,
  glareOpacity = 0.15,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Check for touch device on mount
  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // Raw mouse position values
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  // Smooth spring animations
  const springConfig = { stiffness: 150, damping: 20 };
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [tiltAmount, -tiltAmount]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-tiltAmount, tiltAmount]), springConfig);
  const scaleValue = useSpring(1, springConfig);

  // Glare position
  const glareX = useTransform(mouseX, [0, 1], ["0%", "100%"]);
  const glareY = useTransform(mouseY, [0, 1], ["0%", "100%"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || isTouchDevice) return;

    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseEnter = () => {
    if (isTouchDevice) return;
    setIsHovered(true);
    scaleValue.set(scale);
  };

  const handleMouseLeave = () => {
    if (isTouchDevice) return;
    setIsHovered(false);
    mouseX.set(0.5);
    mouseY.set(0.5);
    scaleValue.set(1);
  };

  // On touch devices, just render children without tilt
  if (isTouchDevice) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        perspective,
        transformStyle: "preserve-3d",
      }}
      className={className}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          scale: scaleValue,
          transformStyle: "preserve-3d",
        }}
        className="relative w-full h-full"
      >
        {/* Content */}
        {children}

        {/* Glare overlay */}
        {glare && (
          <motion.div
            className="absolute inset-0 pointer-events-none rounded-inherit overflow-hidden"
            style={{
              opacity: isHovered ? glareOpacity : 0,
            }}
          >
            <motion.div
              className="absolute w-[200%] h-[200%]"
              style={{
                left: glareX,
                top: glareY,
                x: "-50%",
                y: "-50%",
                background: `radial-gradient(circle at center, rgba(255,255,255,0.8) 0%, transparent 50%)`,
              }}
            />
          </motion.div>
        )}

        {/* Subtle lighting effect that shifts with tilt */}
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-inherit"
          style={{
            background: `linear-gradient(
              135deg,
              rgba(196, 163, 90, 0.05) 0%,
              transparent 50%,
              rgba(0, 0, 0, 0.1) 100%
            )`,
            opacity: isHovered ? 1 : 0,
          }}
        />
      </motion.div>
    </motion.div>
  );
}

// Card content wrapper for 3D depth effect
interface TiltCardContentProps {
  children: ReactNode;
  className?: string;
  depth?: number;
}

export function TiltCardContent({
  children,
  className = "",
  depth = 20,
}: TiltCardContentProps) {
  return (
    <div
      className={className}
      style={{
        transform: `translateZ(${depth}px)`,
        transformStyle: "preserve-3d",
      }}
    >
      {children}
    </div>
  );
}
