'use client';

import CountUp from './CountUp';

interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
  className?: string;
}

export default function StatCard({ label, value, suffix = '', className = '' }: StatCardProps) {
  return (
    <div className={`dashboard-stat-card ${className}`}>
      <div className="dashboard-lcd-number">
        <CountUp value={value} suffix={suffix} />
      </div>
      <div className="dashboard-stat-label">{label}</div>
    </div>
  );
}
