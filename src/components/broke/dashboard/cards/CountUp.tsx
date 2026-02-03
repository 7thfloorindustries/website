'use client';

import { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/dashboard/formatters';

interface CountUpProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}

export default function CountUp({
  value,
  prefix = '',
  suffix = '',
  duration = 1000,
}: CountUpProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = 0;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic)
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(startValue + (value - startValue) * eased);

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <span>
      {prefix}
      {formatNumber(displayValue)}
      {suffix}
    </span>
  );
}
