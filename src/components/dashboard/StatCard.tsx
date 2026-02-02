'use client';

import CountUp from './CountUp';

interface StatCardProps {
  label: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export default function StatCard({ label, value, prefix = '', suffix = '', className = '' }: StatCardProps) {
  return (
    <div className={`dashboard-stat-card ${className}`}>
      <div className="dashboard-lcd-number">
        {typeof value === 'string' ? (
          <span>{prefix}{value}{suffix}</span>
        ) : (
          <CountUp value={value} prefix={prefix} suffix={suffix} />
        )}
      </div>
      <div className="dashboard-stat-label">{label}</div>
    </div>
  );
}
