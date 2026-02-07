"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import AnimatedBackground from "@/components/AnimatedBackground";
import MagneticElement from "@/components/MagneticElement";
import MagneticButton from "@/components/MagneticButton";
import SectionReveal from "@/components/SectionReveal";
import TurnstileWidget from "@/components/TurnstileWidget";
import dynamic from "next/dynamic";

const CustomCursor = dynamic(() => import("@/components/CustomCursor"), {
  ssr: false,
});

const easeCustom = [0.25, 0.46, 0.45, 0.94] as const;

function CreatorSignupForm() {
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [company, setCompany] = useState(""); // Honeypot field
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
    if (!email || !handle) return;

    // Check if Turnstile is required and token is missing
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the security check.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/creator-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          email,
          company,
          csrfToken,
          turnstileToken,
        }),
      });

      if (response.status === 403) {
        setError("Security validation failed. Please refresh and try again.");
        return;
      }

      if (!response.ok) throw new Error("Failed to submit");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-8"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.2 }}
          className="w-16 h-16 rounded-full bg-[#C4A35A]/20 flex items-center justify-center mx-auto mb-6"
        >
          <svg
            className="w-8 h-8 text-[#C4A35A]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </motion.div>
        <p className="text-xl font-semibold text-white mb-2">
          You&apos;re on the list.
        </p>
        <p className="text-white/50">We&apos;ll be in touch soon.</p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      {/* Honeypot field - hidden from users, visible to bots */}
      <input
        type="text"
        name="company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        className="absolute -left-[9999px] opacity-0 pointer-events-none"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <div>
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="Your TikTok @handle"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#C4A35A]/50 transition-colors"
          required
        />
      </div>
      <div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#C4A35A]/50 transition-colors"
          required
        />
      </div>
      <TurnstileWidget
        onVerify={handleTurnstileVerify}
        onError={() => setError("Security check failed. Please try again.")}
        onExpire={() => setTurnstileToken("")}
        className="flex justify-center"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <MagneticButton
        onClick={() => {}}
        variant="primary"
        size="lg"
        loading={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? "Submitting..." : "Get Started"}
      </MagneticButton>
    </form>
  );
}

export default function CreatorsPage() {
  return (
    <>
      <CustomCursor />
      <AnimatedBackground />

      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: easeCustom }}
          className="px-6 md:px-12 lg:px-20 pt-8 md:pt-12"
        >
          <MagneticElement strength={0.15} radius={60}>
            <Link
              href="/"
              className="text-white font-semibold tracking-[0.2em] text-sm hover:text-[#C4A35A] transition-colors"
            >
              7TH FLOOR DIGITAL
            </Link>
          </MagneticElement>
        </motion.header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center px-6 md:px-12 lg:px-20 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <SectionReveal>
              <p className="text-sm text-[#C4A35A] tracking-[0.2em] uppercase mb-6">
                For Creators
              </p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                Make TikToks.
                <br />
                <span className="text-[#C4A35A]">Get paid.</span>
              </h1>
              <p className="text-white/50 text-lg mb-12 max-w-lg mx-auto">
                We connect creators with campaigns that actually fit their vibe.
                No fake energy. Real brands, real money.
              </p>
            </SectionReveal>

            <SectionReveal delay={0.2}>
              <CreatorSignupForm />
            </SectionReveal>
          </div>
        </main>

        {/* Footer */}
        <footer className="px-6 md:px-12 lg:px-20 py-12 border-t border-white/10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <MagneticElement strength={0.15} radius={60}>
              <Link
                href="/"
                className="text-white font-semibold tracking-[0.2em] text-sm hover:text-[#C4A35A] transition-colors"
              >
                7TH FLOOR DIGITAL
              </Link>
            </MagneticElement>
            <p className="text-sm text-white/30">
              © {new Date().getFullYear()} 7th Floor Digital
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
