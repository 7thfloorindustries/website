"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, useInView, useScroll, useTransform, useSpring, AnimatePresence } from "framer-motion";
import CustomCursor from "@/components/CustomCursor";
import AnimatedBackground from "@/components/AnimatedBackground";
import TextScramble from "@/components/TextScramble";
import MagneticElement from "@/components/MagneticElement";
import SectionReveal from "@/components/SectionReveal";
import TiltCard from "@/components/TiltCard";
import VideoBackground from "@/components/VideoBackground";
import MagneticButton from "@/components/MagneticButton";
import { AnimatedTextLogo } from "@/components/AnimatedLogo";
import { verzuzCaseStudy } from "@/data/caseStudies";
import TurnstileWidget from "@/components/TurnstileWidget";

const easeCustom = [0.25, 0.46, 0.45, 0.94] as const;

// Elevator ding sound using Web Audio API
function playElevatorDing() {
  try {
    const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Classic elevator ding - two-tone chime
    oscillator.frequency.setValueAtTime(830, audioContext.currentTime); // G#5
    oscillator.frequency.setValueAtTime(1046, audioContext.currentTime + 0.1); // C6

    oscillator.type = 'sine';

    // Envelope for pleasant ding
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.8);
  } catch {
    // Silently fail if audio isn't available
  }
}

// Elevator Loading Screen
function ElevatorLoader({ onComplete }: { onComplete: () => void }) {
  const [floor, setFloor] = useState(1);
  const [prevFloor, setPrevFloor] = useState(1);
  const [isExiting, setIsExiting] = useState(false);
  const [arrowPulsing, setArrowPulsing] = useState(true);
  const [shake, setShake] = useState(false);
  const [floorLine, setFloorLine] = useState(false);
  const hasInteractedRef = useRef(false);

  // Track user interaction for sound
  useEffect(() => {
    const handleInteraction = () => {
      hasInteractedRef.current = true;
    };
    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Floor timing: pause 0.2s, transition 0.3s = 0.5s per floor
    // Floors 1-6 at steady pace, longer pause before 7
    const floorTimes = [
      0,      // Floor 1 - start
      400,    // Floor 2
      800,    // Floor 3
      1200,   // Floor 4
      1600,   // Floor 5
      2000,   // Floor 6
      2600,   // Floor 7 - longer pause (slowing down)
    ];

    floorTimes.forEach((time, index) => {
      if (index === 0) return;

      // Trigger floor line animation between floors
      timers.push(setTimeout(() => {
        setFloorLine(true);
        setTimeout(() => setFloorLine(false), 150);
      }, time - 200));

      // Trigger shake and floor change
      timers.push(setTimeout(() => {
        setShake(true);
        setTimeout(() => setShake(false), 100);
        setPrevFloor(index);
        setFloor(index + 1);
      }, time));
    });

    // Floor 7 arrival - stop arrow, play ding
    timers.push(setTimeout(() => {
      setArrowPulsing(false);
      if (hasInteractedRef.current) {
        playElevatorDing();
      }
    }, 2600));

    // Hold for 0.5s, then open doors
    timers.push(setTimeout(() => {
      setIsExiting(true);
    }, 3100));

    // Complete after doors open
    timers.push(setTimeout(() => {
      onComplete();
    }, 3700));

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden">
      {/* Top half (door) */}
      <motion.div
        initial={{ y: 0 }}
        animate={{ y: isExiting ? "-100%" : 0 }}
        transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
        className="absolute inset-x-0 top-0 h-1/2 bg-[#0A0A0A]"
        style={{
          borderBottom: isExiting ? '2px solid rgba(196, 163, 90, 0.3)' : 'none',
        }}
      />

      {/* Bottom half (door) */}
      <motion.div
        initial={{ y: 0 }}
        animate={{ y: isExiting ? "100%" : 0 }}
        transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
        className="absolute inset-x-0 bottom-0 h-1/2 bg-[#0A0A0A]"
        style={{
          borderTop: isExiting ? '2px solid rgba(196, 163, 90, 0.3)' : 'none',
        }}
      />

      {/* Floor line passing effect */}
      <AnimatePresence>
        {floorLine && (
          <motion.div
            initial={{ y: "-100%", opacity: 0.3 }}
            animate={{ y: "100%", opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "linear" }}
            className="absolute inset-x-0 h-[1px] bg-white/20 z-10"
            style={{ top: "50%" }}
          />
        )}
      </AnimatePresence>

      {/* Main content - centered indicator */}
      <motion.div
        animate={{
          x: shake ? [0, -2, 2, -1, 1, 0] : 0,
          y: shake ? [0, 1, -1, 0.5, -0.5, 0] : 0,
        }}
        transition={{ duration: 0.1 }}
        className="fixed inset-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: isExiting ? 0 : 1, transition: 'opacity 0.3s' }}
      >
        {/* Brushed metal frame */}
        <div
          className="relative p-8 rounded-sm"
          style={{
            background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 50%, #1a1a1a 100%)',
            boxShadow: `
              inset 0 1px 0 rgba(255,255,255,0.05),
              inset 0 -1px 0 rgba(0,0,0,0.5),
              0 0 40px rgba(0,0,0,0.8),
              0 0 80px rgba(0,0,0,0.4)
            `,
            border: '1px solid rgba(255,255,255,0.03)',
          }}
        >
          {/* Inner chrome bezel */}
          <div
            className="relative px-12 py-6"
            style={{
              background: 'linear-gradient(180deg, #151515 0%, #0a0a0a 100%)',
              boxShadow: `
                inset 0 2px 4px rgba(0,0,0,0.8),
                inset 0 -1px 0 rgba(255,255,255,0.02)
              `,
              borderRadius: '2px',
            }}
          >
            {/* Up arrow */}
            <motion.div
              animate={arrowPulsing ? {
                opacity: [0.6, 1, 0.6],
                textShadow: [
                  '0 0 10px rgba(196, 163, 90, 0.3)',
                  '0 0 20px rgba(196, 163, 90, 0.6), 0 0 30px rgba(196, 163, 90, 0.4)',
                  '0 0 10px rgba(196, 163, 90, 0.3)',
                ],
              } : { opacity: 1 }}
              transition={{ duration: 0.8, repeat: arrowPulsing ? Infinity : 0, ease: "easeInOut" }}
              className="text-center mb-4 text-[#C4A35A]"
              style={{
                fontSize: '24px',
                fontWeight: 300,
              }}
            >
              ▲
            </motion.div>

            {/* Top line */}
            <div
              className="w-20 h-[1px] mx-auto mb-4"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(196, 163, 90, 0.4), transparent)',
              }}
            />

            {/* Floor number display */}
            <div className="relative h-[100px] w-[80px] mx-auto overflow-hidden">
              {/* Previous floor (sliding out) */}
              <motion.div
                key={`prev-${prevFloor}`}
                initial={{ y: 0 }}
                animate={{ y: floor !== prevFloor ? -120 : 0 }}
                transition={{ duration: 0.3, ease: [0.76, 0, 0.24, 1] }}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
                  fontSize: '80px',
                  fontWeight: 300,
                  color: '#C4A35A',
                  textShadow: `
                    0 0 30px rgba(196, 163, 90, 0.5),
                    0 0 60px rgba(196, 163, 90, 0.3),
                    0 0 2px rgba(196, 163, 90, 0.8)
                  `,
                  lineHeight: 1,
                }}
              >
                {floor === prevFloor ? floor : prevFloor}
              </motion.div>

              {/* Current floor (sliding in) */}
              {floor !== prevFloor && (
                <motion.div
                  key={`current-${floor}`}
                  initial={{ y: 120 }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.3, ease: [0.76, 0, 0.24, 1] }}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
                    fontSize: '80px',
                    fontWeight: 300,
                    color: '#C4A35A',
                    textShadow: `
                      0 0 30px rgba(196, 163, 90, 0.5),
                      0 0 60px rgba(196, 163, 90, 0.3),
                      0 0 2px rgba(196, 163, 90, 0.8)
                    `,
                    lineHeight: 1,
                  }}
                >
                  {floor}
                </motion.div>
              )}

              {/* LCD backlight glow effect */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(196, 163, 90, 0.08) 0%, transparent 70%)',
                }}
              />
            </div>

            {/* Bottom line */}
            <div
              className="w-20 h-[1px] mx-auto mt-4"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(196, 163, 90, 0.4), transparent)',
              }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Word reveal animation
function WordReveal({ text, className = "", startDelay = 0 }: { text: string; className?: string; startDelay?: number }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden mr-[0.3em]">
          <motion.span
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.5, delay: startDelay + i * 0.15, ease: easeCustom }}
            className="inline-block will-change-transform"
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

// Count-up animation
function CountUp({ end, prefix = "", suffix = "", duration = 2, decimals = 0 }: { end: number | string; prefix?: string; suffix?: string; duration?: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [displayValue, setDisplayValue] = useState("0");
  const [hasAnimated, setHasAnimated] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const isRankingFormat = typeof end === "string" && end.includes("#");

  useEffect(() => {
    if (isInView && !hasAnimated) {
      setHasAnimated(true);
      if (isRankingFormat) {
        const rankEnd = parseInt(end.toString().replace(/[^0-9]/g, "")) || 1;
        const startTime = Date.now();
        const durationMs = duration * 1000;
        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / durationMs, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const currentRank = Math.ceil(eased * rankEnd);
          setDisplayValue(`#${currentRank}`);
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            setDisplayValue(`#${rankEnd}`);
            setIsComplete(true);
          }
        };
        requestAnimationFrame(animate);
      } else {
        const numericEnd = typeof end === "number" ? end : parseFloat(end.toString().replace(/[^0-9.]/g, ""));
        const startTime = Date.now();
        const durationMs = duration * 1000;
        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / durationMs, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const currentValue = eased * numericEnd;
          if (decimals > 0) {
            setDisplayValue(currentValue.toFixed(decimals));
          } else {
            setDisplayValue(Math.floor(currentValue).toLocaleString());
          }
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            setDisplayValue(decimals > 0 ? numericEnd.toFixed(decimals) : numericEnd.toLocaleString());
            setIsComplete(true);
          }
        };
        requestAnimationFrame(animate);
      }
    }
  }, [isInView, end, duration, hasAnimated, isRankingFormat, decimals]);

  return (
    <motion.span ref={ref} animate={{ textShadow: isComplete ? "0 0 30px rgba(196, 163, 90, 0.5)" : "none" }} transition={{ duration: 0.3 }}>
      {isRankingFormat ? displayValue : `${prefix}${displayValue}${suffix}`}
    </motion.span>
  );
}

// Gold line
function GoldLine({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <motion.div initial={{ width: 0 }} animate={{ width: isInView ? "100%" : 0 }} transition={{ duration: 1.5, ease: easeCustom, delay }} className="gold-line" />
    </div>
  );
}

// Scroll progress
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });
  return <motion.div className="fixed top-0 left-0 right-0 h-[2px] bg-[#C4A35A] origin-left z-50" style={{ scaleX }} />;
}

// Gradient orb
function GradientOrb() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 0.15, scale: 1 }}
      transition={{ duration: 1.5, delay: 1.5, ease: easeCustom }}
      className="absolute right-0 top-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[500px] md:h-[500px] lg:w-[600px] lg:h-[600px] pointer-events-none"
    >
      <motion.div animate={{ x: [0, 30, 0, -20, 0], y: [0, -20, 30, -10, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} className="w-full h-full relative">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#C4A35A]/30 via-purple-900/20 to-transparent blur-3xl" />
        <div className="absolute inset-[20%] rounded-full bg-gradient-to-tr from-[#C4A35A]/20 via-amber-600/10 to-transparent blur-2xl" />
      </motion.div>
    </motion.div>
  );
}

// Contact form
function ContactForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // Honeypot field
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  // Fetch CSRF token on mount
  useEffect(() => {
    fetch("/api/csrf")
      .then((res) => res.json())
      .then((data) => setCsrfToken(data.csrfToken))
      .catch(() => console.error("Failed to fetch CSRF token"));
  }, []);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    // Check if Turnstile is required and token is missing
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the security check.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          message,
          website,
          csrfToken,
          turnstileToken,
        }),
      });

      if (response.status === 403) {
        setError("Security validation failed. Please refresh and try again.");
        return;
      }

      if (!response.ok) throw new Error("Failed to send");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-4">
        <p className="text-[#C4A35A] font-medium">Message sent. We'll be in touch.</p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Honeypot field - hidden from users, visible to bots */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute -left-[9999px] opacity-0 pointer-events-none"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#C4A35A]/50 transition-colors"
        required
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Tell us about your project (optional)"
        rows={3}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#C4A35A]/50 transition-colors resize-none"
      />
      <TurnstileWidget
        onVerify={handleTurnstileVerify}
        onError={() => setError("Security check failed. Please try again.")}
        onExpire={() => setTurnstileToken("")}
        className="flex justify-center"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <MagneticButton onClick={() => {}} variant="primary" loading={isSubmitting} className="w-full">
        {isSubmitting ? "Sending..." : "Send Message"}
      </MagneticButton>
    </form>
  );
}

export default function Home() {
  const [showLoader, setShowLoader] = useState(true);
  const [loadPhase, setLoadPhase] = useState(0);
  const heroRef = useRef<HTMLElement>(null);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 500], [0, -100]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasVisited = sessionStorage.getItem("7thfloor-visited");
      if (hasVisited) {
        setShowLoader(false);
        setLoadPhase(6);
      }
    }
  }, []);

  const handleLoaderComplete = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("7thfloor-visited", "true");
    }
    setShowLoader(false);
  };

  useEffect(() => {
    if (showLoader) return;
    const timers = [
      setTimeout(() => setLoadPhase(1), 100),
      setTimeout(() => setLoadPhase(2), 500),
      setTimeout(() => setLoadPhase(3), 800),
      setTimeout(() => setLoadPhase(4), 1800),
      setTimeout(() => setLoadPhase(5), 2200),
      setTimeout(() => setLoadPhase(6), 2500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [showLoader]);

  return (
    <>
      <AnimatePresence>{showLoader && <ElevatorLoader onComplete={handleLoaderComplete} />}</AnimatePresence>
      <CustomCursor />
      <AnimatedBackground />
      <ScrollProgress />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: !showLoader && loadPhase >= 1 ? 1 : 0 }} transition={{ duration: 0.5 }} className="min-h-screen bg-[#0A0A0A] text-white relative">
        {/* ═══════════════════════════════════════════════════════════════
            SECTION 1: HERO
        ═══════════════════════════════════════════════════════════════ */}
        <motion.section ref={heroRef} id="hero" style={{ y: heroY }} className="relative min-h-[90vh] flex flex-col px-6 md:px-12 lg:px-20 overflow-hidden">
          <VideoBackground fallbackImageSrc="/7thfloor.png" opacity={0.15} grayscale kenBurns overlay overlayOpacity={0.4} />
          <GradientOrb />

          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: loadPhase >= 1 ? 1 : 0, y: loadPhase >= 1 ? 0 : -20 }}
            transition={{ duration: 0.5, ease: easeCustom }}
            className="pt-8 md:pt-12 relative z-10"
          >
            <AnimatedTextLogo size="md" />
          </motion.header>

          <div className="flex-1 flex flex-col justify-center max-w-5xl relative z-10">
            <div className="mb-8">
              {loadPhase >= 3 && (
                <h1 className="text-4xl md:text-6xl lg:text-7xl xl:text-8xl leading-[1.05] tracking-tight text-white" style={{ fontWeight: 800 }}>
                  <WordReveal text="We turn culture into conversation." startDelay={0} />
                </h1>
              )}
            </div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: loadPhase >= 4 ? 1 : 0, y: loadPhase >= 4 ? 0 : 20 }}
              transition={{ duration: 0.8, ease: easeCustom }}
              className="text-lg md:text-xl text-thin text-white/40 max-w-2xl mb-12"
            >
              Music marketing and cultural strategy for artists, labels, and brands who want to be part of the conversation.
            </motion.p>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: loadPhase >= 5 ? 1 : 0 }} transition={{ duration: 0.3 }}>
              {loadPhase >= 5 && <GoldLine className="max-w-md" />}
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: loadPhase >= 6 ? 1 : 0 }} transition={{ duration: 0.8 }} className="absolute bottom-12 left-6 md:left-12 lg:left-20">
            <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="text-white/30 text-sm text-thin tracking-wider">
              Scroll
            </motion.div>
          </motion.div>
        </motion.section>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 2: CASE STUDY
        ═══════════════════════════════════════════════════════════════ */}
        <section id="work" className="px-6 md:px-12 lg:px-20 pt-20 md:pt-32 pb-12 md:pb-20">
          <SectionReveal>
            <p className="text-sm text-white/40 text-thin tracking-[0.2em] uppercase mb-8">Featured Work</p>
          </SectionReveal>

          <TiltCard tiltAmount={8} className="max-w-5xl">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, ease: easeCustom }}
              whileHover={{ y: -4, boxShadow: "0 8px 40px rgba(196, 163, 90, 0.15)" }}
              className="case-study-card p-8 md:p-10 lg:p-12 overflow-hidden rounded-lg"
              style={{ borderLeft: "4px solid #C4A35A" }}
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8 lg:gap-16">
                <div className="lg:max-w-xl">
                  <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.2, ease: easeCustom }}
                    className="text-2xl md:text-3xl lg:text-4xl text-semibold tracking-tight mb-4"
                  >
                    {verzuzCaseStudy.title}
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.3, ease: easeCustom }}
                    className="text-[#C4A35A] text-sm tracking-[0.15em] uppercase mb-6"
                  >
                    {verzuzCaseStudy.category}
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.4, ease: easeCustom }}
                    className="text-white/50 text-thin leading-relaxed"
                  >
                    {verzuzCaseStudy.description}
                  </motion.p>
                </div>

                <div className="flex justify-between" style={{ gap: "40px" }}>
                  {verzuzCaseStudy.stats.map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, delay: 0.5 + i * 0.1, ease: easeCustom }}
                      className="flex flex-col items-center lg:items-start flex-1"
                    >
                      <p className="text-[#C4A35A] mb-2" style={{ fontSize: "64px", fontWeight: 700, lineHeight: 1 }}>
                        {stat.numericValue !== undefined ? <CountUp end={stat.numericValue} prefix={stat.prefix} suffix={stat.suffix} decimals={stat.decimals} /> : stat.value}
                      </p>
                      <p className="text-xs text-white/40 tracking-[0.1em] uppercase">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
              </div>

              <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.8 }} className="mt-10">
                <GoldLine delay={0.3} />
              </motion.div>
            </motion.div>
          </TiltCard>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            NDA NOTICE
        ═══════════════════════════════════════════════════════════════ */}
        <div className="px-6 md:px-12 lg:px-20 py-12 md:py-16 text-center">
          <p className="text-white/30 text-sm md:text-base italic">
            Additional campaigns under NDA include multiple TikTok viral chart placements for major label artists.
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 3: CONTACT
        ═══════════════════════════════════════════════════════════════ */}
        <section id="contact" className="px-6 md:px-12 lg:px-20 py-20 md:py-32 border-t border-white/10">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              <SectionReveal>
                <p className="text-sm text-white/40 tracking-[0.2em] uppercase mb-4">Get in Touch</p>
                <h2 className="text-3xl md:text-4xl font-bold mb-6">Let's work together.</h2>
                <p className="text-white/50 mb-8">Have a project in mind? Drop us a line.</p>

                <MagneticElement strength={0.15} radius={100}>
                  <TextScramble text="marketing@7thfloor.digital" href="mailto:marketing@7thfloor.digital" className="text-xl md:text-2xl text-thin hover-underline transition-smooth hover:text-[#C4A35A] block mb-8" />
                </MagneticElement>
              </SectionReveal>

              <SectionReveal delay={0.2}>
                <p className="text-sm text-white/40 tracking-[0.2em] uppercase mb-4">Quick Inquiry</p>
                <ContactForm />
              </SectionReveal>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            FOOTER
        ═══════════════════════════════════════════════════════════════ */}
        <footer className="px-6 md:px-12 lg:px-20 py-12 border-t border-[#C4A35A]/20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <MagneticElement strength={0.15} radius={60}>
              <span className="text-white font-semibold tracking-[0.2em] text-sm">7TH FLOOR DIGITAL</span>
            </MagneticElement>
            <div className="flex items-center gap-6">
              <a href="/creators" className="text-sm text-white/30 hover:text-white/50 transition-colors">
                For creators
              </a>
              <p className="text-sm text-white/30">© {new Date().getFullYear()} 7th Floor Digital</p>
            </div>
          </div>
        </footer>
      </motion.div>
    </>
  );
}
