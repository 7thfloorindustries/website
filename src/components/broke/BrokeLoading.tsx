'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

interface BrokeLoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export default function BrokeLoading({ size = 'md', text }: BrokeLoadingProps) {
  const sizes = {
    sm: { logo: 32, container: 60 },
    md: { logo: 48, container: 80 },
    lg: { logo: 64, container: 100 },
  };

  const { logo, container } = sizes[size];

  return (
    <div className="broke-loading">
      <div
        className="broke-loading-container"
        style={{ width: container, height: container }}
      >
        {/* Outer glow ring */}
        <motion.div
          className="broke-loading-ring"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Inner pulse ring */}
        <motion.div
          className="broke-loading-pulse"
          animate={{
            scale: [1, 1.4, 1],
            opacity: [0.5, 0, 0.5],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />

        {/* Logo */}
        <motion.div
          className="broke-loading-logo"
          animate={{
            scale: [1, 1.05, 1],
            rotate: [0, 3, -3, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <Image
            src="/broke/logo.svg"
            alt="Loading"
            width={logo}
            height={logo}
            priority
          />
        </motion.div>
      </div>

      {text && (
        <motion.p
          className="broke-loading-text"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}
