"use client";

import { useRef, useEffect, useState, ReactNode } from "react";
import { motion, useScroll, useTransform, useSpring, useMotionValueEvent } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import TiltCard from "./TiltCard";

interface CaseStudyCard {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  image?: string;
  stats?: { label: string; value: string }[];
  color?: string;
}

interface HorizontalGalleryProps {
  items: CaseStudyCard[];
  className?: string;
}

export default function HorizontalGallery({ items, className = "" }: HorizontalGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Check for mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Calculate horizontal scroll based on vertical scroll progress
  const cardWidth = 500; // Base card width
  const gap = 40; // Gap between cards
  const totalWidth = items.length * (cardWidth + gap) - gap;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  const maxScroll = Math.max(0, totalWidth - viewportWidth + 200);

  const x = useTransform(scrollYProgress, [0, 1], [100, -maxScroll]);
  const smoothX = useSpring(x, { stiffness: 100, damping: 30 });

  // Track active card
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const index = Math.round(value * (items.length - 1));
    setActiveIndex(Math.min(Math.max(0, index), items.length - 1));
  });

  // Mobile: vertical layout
  if (isMobile) {
    return (
      <div className={`space-y-8 ${className}`}>
        {items.map((item, index) => (
          <GalleryCard key={item.id} item={item} index={index} />
        ))}
      </div>
    );
  }

  // Desktop: horizontal scroll-jacking
  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ height: `${(items.length + 1) * 100}vh` }}
    >
      <div className="sticky top-0 h-screen flex items-center overflow-hidden">
        {/* Background parallax layer */}
        <motion.div
          className="absolute inset-0 opacity-20"
          style={{ x: useTransform(scrollYProgress, [0, 1], [0, -100]) }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#C4A35A]/5 to-transparent" />
        </motion.div>

        {/* Cards container */}
        <motion.div
          ref={scrollRef}
          className="flex items-center gap-10 pl-20"
          style={{ x: smoothX }}
        >
          {items.map((item, index) => (
            <GalleryCard key={item.id} item={item} index={index} />
          ))}
        </motion.div>

        {/* Progress dots */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-3">
          {items.map((_, index) => (
            <motion.button
              key={index}
              className="w-2 h-2 rounded-full transition-colors duration-300"
              style={{
                backgroundColor: activeIndex === index ? "#C4A35A" : "rgba(255,255,255,0.2)",
              }}
              whileHover={{ scale: 1.5 }}
              onClick={() => {
                if (containerRef.current) {
                  const targetScroll = (index / (items.length - 1)) * containerRef.current.scrollHeight;
                  window.scrollTo({ top: targetScroll, behavior: "smooth" });
                }
              }}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        {/* Navigation hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-12 right-12 text-white/30 text-sm"
        >
          Scroll to explore
        </motion.div>
      </div>
    </div>
  );
}

// Individual gallery card
interface GalleryCardProps {
  item: CaseStudyCard;
  index: number;
}

function GalleryCard({ item, index }: GalleryCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <TiltCard
      className="flex-shrink-0 w-[85vw] md:w-[500px] h-[400px] md:h-[500px]"
      tiltAmount={8}
    >
      <Link href={`/work/${item.slug}`} className="block h-full">
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: index * 0.1 }}
          className="relative h-full rounded-lg overflow-hidden group"
          style={{
            background: `linear-gradient(135deg, #111 0%, #0D0D0D 100%)`,
            borderLeft: "4px solid #C4A35A",
          }}
        >
          {/* Background image with parallax */}
          {item.image && (
            <motion.div
              className="absolute inset-0"
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.6 }}
            >
              <Image
                src={item.image}
                alt={item.title}
                fill
                className="object-cover opacity-30 group-hover:opacity-40 transition-opacity duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/80 to-transparent" />
            </motion.div>
          )}

          {/* Content */}
          <div className="relative h-full flex flex-col justify-end p-8 md:p-10">
            {/* Category tag */}
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-[#C4A35A] text-sm tracking-[0.15em] uppercase mb-4"
            >
              {item.category}
            </motion.span>

            {/* Title */}
            <motion.h3
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-2xl md:text-3xl font-semibold text-white mb-4 group-hover:text-[#C4A35A] transition-colors duration-300"
            >
              {item.title}
            </motion.h3>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="text-white/50 text-sm leading-relaxed line-clamp-3 mb-6"
            >
              {item.description}
            </motion.p>

            {/* Stats row */}
            {item.stats && (
              <div className="flex gap-8">
                {item.stats.slice(0, 3).map((stat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="flex flex-col"
                  >
                    <span className="text-[#C4A35A] text-xl md:text-2xl font-bold">
                      {stat.value}
                    </span>
                    <span className="text-white/40 text-xs uppercase tracking-wider">
                      {stat.label}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}

            {/* View project indicator */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              whileHover={{ x: 5 }}
              className="absolute bottom-8 right-8 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            >
              <span className="text-[#C4A35A] text-sm flex items-center gap-2">
                View Project
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
              </span>
            </motion.div>
          </div>
        </motion.div>
      </Link>
    </TiltCard>
  );
}
