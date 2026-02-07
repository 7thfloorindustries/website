"use client";

import { useRef } from "react";
import { motion, useInView, useScroll, useSpring } from "framer-motion";
import FloatingNav from "@/components/FloatingNav";
import SectionReveal from "@/components/SectionReveal";
import MagneticElement from "@/components/MagneticElement";
import MagneticButton from "@/components/MagneticButton";
import TextScramble from "@/components/TextScramble";
import AnimatedBackground from "@/components/AnimatedBackground";
import dynamic from "next/dynamic";

const CustomCursor = dynamic(() => import("@/components/CustomCursor"), {
  ssr: false,
});

const easeCustom = [0.25, 0.46, 0.45, 0.94] as const;

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });
  return <motion.div className="fixed top-0 left-0 right-0 h-[2px] bg-[#C4A35A] origin-left z-50" style={{ scaleX }} />;
}

function GoldLine({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <motion.div initial={{ width: 0 }} animate={{ width: isInView ? "100%" : 0 }} transition={{ duration: 1.5, ease: easeCustom, delay }} className="gold-line" />
    </div>
  );
}

const services = [
  {
    number: "01",
    title: "Campaign Seeding",
    description: "Strategic content distribution across the platforms that matter. We place your music where culture lives — Twitter, TikTok, Instagram, and YouTube — through creator partnerships and community-driven amplification that feels organic, not forced.",
    features: ["Multi-platform distribution", "Creator partnerships", "Community-driven amplification", "Organic placement strategy"],
    icon: "🌱",
  },
  {
    number: "02",
    title: "Real-Time Analytics",
    description: "Live campaign dashboards updated hourly with verified view counts across every platform. Our private, client-only reporting infrastructure gives you visibility into exactly how your campaign is performing — in real time, not after the fact.",
    features: ["Hourly dashboard updates", "Multi-platform tracking", "Verified view counts", "Private client-only access"],
    icon: "📊",
  },
  {
    number: "03",
    title: "Creator Outreach",
    description: "A vetted network of hip-hop and R&B content creators ready to amplify your music. We match your sound with creators who have genuine cultural relevance — scaling from micro-influencers to macro placements based on campaign goals.",
    features: ["Vetted creator network", "Cultural relevance matching", "Micro to macro scale", "Hip-hop & R&B focus"],
    icon: "🤝",
  },
  {
    number: "04",
    title: "Trend Monitoring & Intelligence",
    description: "24/7 AI-powered viral content detection that identifies opportunities before trends peak. Competitive intelligence and market analysis that keeps you ahead of the conversation, not chasing it.",
    features: ["AI-powered detection", "Pre-peak identification", "Competitive intelligence", "Market analysis"],
    icon: "🔍",
  },
  {
    number: "05",
    title: "Campaign Optimization",
    description: "AI-driven performance analysis running continuously across every active campaign. Real-time budget reallocation and strategy adjustment powered by enterprise-grade infrastructure built for speed and scale.",
    features: ["Continuous AI analysis", "Real-time budget reallocation", "Strategy adjustment", "Enterprise infrastructure"],
    icon: "⚡",
  },
  {
    number: "06",
    title: "Content Strategy",
    description: "From post-event content repurposing to cultural moment identification and rapid response. We build buzz organically by turning every touchpoint into amplification — keeping your campaign in the conversation long after launch.",
    features: ["Content repurposing", "Organic amplification", "Cultural moment response", "Sustained buzz-building"],
    icon: "🎯",
  },
];

function ServiceCard({ service, index }: { service: typeof services[0]; index: number }) {
  const isEven = index % 2 === 0;

  return (
    <SectionReveal direction={isEven ? "left" : "right"} delay={0.1}>
      <motion.div
        whileHover={{ y: -4, boxShadow: "0 8px 40px rgba(196, 163, 90, 0.1)" }}
        transition={{ duration: 0.3 }}
        className="relative p-8 md:p-10 lg:p-12 rounded-lg overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #111111, #0D0D0D)",
          borderLeft: "4px solid #C4A35A",
          boxShadow: "0 4px 30px rgba(0, 0, 0, 0.3)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderLeftWidth: "4px",
          borderLeftColor: "#C4A35A",
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-16">
          <div className="lg:flex-1">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-[#C4A35A] text-sm tracking-[0.2em] font-mono">{service.number}</span>
              <div className="w-8 h-px bg-[#C4A35A]/30" />
            </div>
            <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
              <TextScramble text={service.title} className="text-white" />
            </h3>
            <p className="text-white/50 text-thin leading-relaxed text-base md:text-lg">
              {service.description}
            </p>
          </div>

          <div className="lg:w-72 flex-shrink-0">
            <p className="text-xs text-white/30 tracking-[0.15em] uppercase mb-4">Capabilities</p>
            <ul className="space-y-3">
              {service.features.map((feature, i) => (
                <motion.li
                  key={feature}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.1, ease: easeCustom }}
                  className="flex items-center gap-3 text-sm text-white/60"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C4A35A] flex-shrink-0" />
                  {feature}
                </motion.li>
              ))}
            </ul>
          </div>
        </div>

        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.6 }} className="mt-8">
          <GoldLine delay={0.2} />
        </motion.div>
      </motion.div>
    </SectionReveal>
  );
}

export default function ServicesPage() {
  return (
    <>
      <CustomCursor />
      <AnimatedBackground />
      <ScrollProgress />
      <FloatingNav />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="min-h-screen bg-[#0A0A0A] text-white relative"
      >
        {/* Hero */}
        <section className="relative min-h-[70vh] flex flex-col justify-center px-6 md:px-12 lg:px-20 pt-20 pb-16 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.12, scale: 1 }}
            transition={{ duration: 1.5, delay: 0.5 }}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none"
          >
            <div className="w-full h-full relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#C4A35A]/30 via-purple-900/20 to-transparent blur-3xl" />
            </div>
          </motion.div>

          <div className="max-w-5xl relative z-10">
            <SectionReveal>
              <p className="text-sm text-[#C4A35A] tracking-[0.3em] uppercase mb-6 text-thin">What We Do</p>
            </SectionReveal>

            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: easeCustom }}
              className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-8"
            >
              Built for the
              <br />
              <span className="gradient-text">speed of culture.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: easeCustom }}
              className="text-lg md:text-xl text-white/40 text-thin max-w-2xl mb-12"
            >
              End-to-end campaign infrastructure for music marketing. From seeding to analytics, every tool built to move at the pace of the conversation.
            </motion.p>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.6 }}>
              <GoldLine className="max-w-md" />
            </motion.div>
          </div>
        </section>

        {/* Services */}
        <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24">
          <div className="max-w-5xl space-y-12 md:space-y-16">
            {services.map((service, i) => (
              <ServiceCard key={service.number} service={service} index={i} />
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 border-t border-white/10">
          <div className="max-w-3xl mx-auto text-center">
            <SectionReveal>
              <p className="text-sm text-[#C4A35A] tracking-[0.3em] uppercase mb-6">Ready to Start</p>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
                Let&apos;s build your next campaign.
              </h2>
              <p className="text-white/40 text-thin text-lg mb-10 max-w-xl mx-auto">
                Whether you&apos;re launching a single or rolling out an album, we have the infrastructure to make it move.
              </p>
            </SectionReveal>

            <SectionReveal delay={0.2}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <MagneticButton href="/#contact" variant="primary" size="lg">
                  Get in Touch
                </MagneticButton>
                <MagneticElement strength={0.15} radius={80}>
                  <TextScramble
                    text="marketing@7thfloor.digital"
                    href="mailto:marketing@7thfloor.digital"
                    className="text-white/50 hover:text-[#C4A35A] transition-smooth text-sm"
                  />
                </MagneticElement>
              </div>
            </SectionReveal>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 md:px-12 lg:px-20 py-12 border-t border-[#C4A35A]/20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <MagneticElement strength={0.15} radius={60}>
              <span className="text-white font-semibold tracking-[0.2em] text-sm">7TH FLOOR DIGITAL</span>
            </MagneticElement>
            <p className="text-sm text-white/30">© {new Date().getFullYear()} 7th Floor Digital</p>
          </div>
        </footer>
      </motion.div>
    </>
  );
}
