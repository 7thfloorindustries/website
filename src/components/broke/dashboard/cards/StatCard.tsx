'use client';

import { motion } from 'framer-motion';
import CountUp from './CountUp';

interface StatCardProps {
  label: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  delay?: number;
}

export default function StatCard({
  label,
  value,
  prefix = '',
  suffix = '',
  delay = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="broke-dash-card accent-left broke-dash-stat-card"
    >
      <div className="broke-dash-stat-value broke-dash-glow">
        {typeof value === 'string' ? (
          <span>
            {prefix}
            {value}
            {suffix}
          </span>
        ) : (
          <CountUp value={value} prefix={prefix} suffix={suffix} />
        )}
      </div>
      <div className="broke-dash-stat-label">
        {label}
      </div>
    </motion.div>
  );
}
