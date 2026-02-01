"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, useSpring, useReducedMotion } from "framer-motion";

// Particle types for variety
const PARTICLE_CHARS = ['$', '♪', '♫', '✦', '•', '◆'];

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  opacity: number;
  scale: number;
  rotation: number;
  rotationSpeed: number;
}

interface TrailPoint {
  x: number;
  y: number;
  opacity: number;
}

// Particle system managed outside React for performance
class ParticleSystem {
  particles: Particle[] = [];
  nextId = 0;
  container: HTMLDivElement | null = null;
  animationFrame: number | null = null;
  lastTime = 0;

  private readonly MAX_PARTICLES = 50;
  private readonly GRAVITY = 800;
  private readonly FADE_SPEED = 1.2;

  init(container: HTMLDivElement) {
    this.container = container;
    this.startLoop();
  }

  destroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.particles = [];
  }

  burst(x: number, y: number) {
    const count = 8 + Math.floor(Math.random() * 8);
    const available = this.MAX_PARTICLES - this.particles.length;
    const toSpawn = Math.min(count, available);

    for (let i = 0; i < toSpawn; i++) {
      const angle = -Math.PI * 0.1 - Math.random() * Math.PI * 0.8;
      const speed = 300 + Math.random() * 200;

      this.particles.push({
        id: this.nextId++,
        x,
        y,
        vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
        vy: Math.sin(angle) * speed,
        char: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)],
        opacity: 1,
        scale: 0.6 + Math.random() * 0.5,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 720,
      });
    }
  }

  startLoop() {
    this.lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - this.lastTime) / 1000, 0.1);
      this.lastTime = time;

      this.update(dt);
      this.render();

      this.animationFrame = requestAnimationFrame(loop);
    };

    this.animationFrame = requestAnimationFrame(loop);
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      p.vy += this.GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
      p.vx *= 0.98;
      p.opacity -= this.FADE_SPEED * dt;

      if (p.opacity <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = '';

    for (const p of this.particles) {
      const el = document.createElement('span');
      el.textContent = p.char;
      el.style.cssText = `
        position: fixed;
        left: ${p.x}px;
        top: ${p.y}px;
        color: #C4A35A;
        font-size: ${12 * p.scale}px;
        opacity: ${p.opacity};
        transform: translate(-50%, -50%) rotate(${p.rotation}deg) scale(${p.scale});
        pointer-events: none;
        user-select: none;
        font-family: system-ui, sans-serif;
        text-shadow: 0 0 4px rgba(196, 163, 90, 0.5);
        z-index: 99999;
      `;
      this.container.appendChild(el);
    }
  }
}

// Trail system
const TRAIL_LENGTH = 8;

export default function CustomCursor() {
  const [isHovering, setIsHovering] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const prefersReducedMotion = useReducedMotion();

  const particleContainerRef = useRef<HTMLDivElement>(null);
  const particleSystemRef = useRef<ParticleSystem | null>(null);
  const lastPositionRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef(0);

  const cursorX = useSpring(0, { stiffness: 500, damping: 28 });
  const cursorY = useSpring(0, { stiffness: 500, damping: 28 });

  const ringX = useSpring(0, { stiffness: 150, damping: 15 });
  const ringY = useSpring(0, { stiffness: 150, damping: 15 });

  // Initialize particle system
  useEffect(() => {
    if (particleContainerRef.current && !particleSystemRef.current) {
      particleSystemRef.current = new ParticleSystem();
      particleSystemRef.current.init(particleContainerRef.current);
    }

    return () => {
      particleSystemRef.current?.destroy();
      particleSystemRef.current = null;
    };
  }, []);

  const handleBurst = useCallback((x: number, y: number) => {
    particleSystemRef.current?.burst(x, y);
  }, []);

  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice(window.matchMedia("(pointer: coarse)").matches);
    };
    checkTouch();

    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;

      // Calculate velocity for trail intensity
      const dx = clientX - lastPositionRef.current.x;
      const dy = clientY - lastPositionRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      velocityRef.current = distance;

      lastPositionRef.current = { x: clientX, y: clientY };

      cursorX.set(clientX);
      cursorY.set(clientY);
      ringX.set(clientX);
      ringY.set(clientY);

      if (!isVisible) setIsVisible(true);

      // Update trail (only if not reduced motion and significant movement)
      if (!prefersReducedMotion && distance > 2) {
        setTrail((prev) => {
          const newTrail = [
            { x: clientX, y: clientY, opacity: 1 },
            ...prev.slice(0, TRAIL_LENGTH - 1),
          ];
          return newTrail.map((point, i) => ({
            ...point,
            opacity: 1 - i / TRAIL_LENGTH,
          }));
        });
      }
    };

    const handleMouseEnter = () => setIsVisible(true);
    const handleMouseLeave = () => {
      setIsVisible(false);
      setTrail([]);
    };

    const handleHoverStart = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "A" ||
        target.tagName === "BUTTON" ||
        target.closest("a") ||
        target.closest("button") ||
        target.classList.contains("cursor-pointer") ||
        target.closest(".cursor-pointer")
      ) {
        setIsHovering(true);
      }
    };

    const handleHoverEnd = () => {
      setIsHovering(false);
    };

    const handleClick = (e: MouseEvent) => {
      handleBurst(e.clientX, e.clientY);
    };

    const handleTouch = (e: TouchEvent) => {
      const touch = e.touches[0] || e.changedTouches[0];
      if (touch) {
        handleBurst(touch.clientX, touch.clientY);
      }
    };

    // Trail fade effect (run continuously)
    let trailFrame: number;
    const fadeTrail = () => {
      setTrail((prev) =>
        prev
          .map((point) => ({
            ...point,
            opacity: point.opacity * 0.9,
          }))
          .filter((point) => point.opacity > 0.05)
      );
      trailFrame = requestAnimationFrame(fadeTrail);
    };
    if (!prefersReducedMotion) {
      trailFrame = requestAnimationFrame(fadeTrail);
    }

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseenter", handleMouseEnter);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseover", handleHoverStart);
    document.addEventListener("mouseout", handleHoverEnd);
    document.addEventListener("click", handleClick);
    document.addEventListener("touchstart", handleTouch, { passive: true });

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseenter", handleMouseEnter);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseover", handleHoverStart);
      document.removeEventListener("mouseout", handleHoverEnd);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("touchstart", handleTouch);
      if (trailFrame) cancelAnimationFrame(trailFrame);
    };
  }, [cursorX, cursorY, ringX, ringY, isVisible, handleBurst, prefersReducedMotion]);

  return (
    <>
      {/* Particle container */}
      <div
        ref={particleContainerRef}
        className="fixed inset-0 pointer-events-none z-[99999] overflow-hidden"
        aria-hidden="true"
      />

      {/* Custom cursor - only on non-touch devices */}
      {!isTouchDevice && (
        <>
          {/* Trail dots */}
          {!prefersReducedMotion &&
            trail.map((point, i) => (
              <motion.div
                key={i}
                className="fixed pointer-events-none z-[9997]"
                style={{
                  left: point.x,
                  top: point.y,
                  translateX: "-50%",
                  translateY: "-50%",
                  opacity: point.opacity * 0.6,
                }}
              >
                <div
                  className="rounded-full bg-[#C4A35A]"
                  style={{
                    width: `${Math.max(2, 8 - i)}px`,
                    height: `${Math.max(2, 8 - i)}px`,
                  }}
                />
              </motion.div>
            ))}

          {/* Inner gold dot */}
          <motion.div
            className="fixed pointer-events-none z-[9999] mix-blend-difference"
            style={{
              x: cursorX,
              y: cursorY,
              translateX: "-50%",
              translateY: "-50%",
            }}
          >
            <motion.div
              animate={{
                scale: isHovering ? 0.5 : 1,
                opacity: isVisible ? 1 : 0,
              }}
              transition={{ duration: 0.2 }}
              className="w-3 h-3 rounded-full bg-[#C4A35A]"
            />
          </motion.div>

          {/* Outer ring */}
          <motion.div
            className="fixed pointer-events-none z-[9998]"
            style={{
              x: ringX,
              y: ringY,
              translateX: "-50%",
              translateY: "-50%",
            }}
          >
            <motion.div
              animate={{
                scale: isHovering ? 1.5 : 1,
                opacity: isVisible ? 1 : 0,
              }}
              transition={{ type: "spring", stiffness: 150, damping: 15 }}
              className="w-10 h-10 rounded-full border-2 border-[#C4A35A]/40"
            />
          </motion.div>
        </>
      )}
    </>
  );
}
