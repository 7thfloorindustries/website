interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
}

export default function StatCard({ label, value, subtitle, icon }: StatCardProps) {
  return (
    <div className="inf-dash-card inf-dash-stat-card">
      {icon && <div className="inf-dash-stat-icon">{icon}</div>}
      <div className="inf-dash-stat-value inf-dash-glow">{value}</div>
      <div className="inf-dash-stat-label">{label}</div>
      {subtitle && <div className="inf-dash-stat-subtitle">{subtitle}</div>}
    </div>
  );
}
