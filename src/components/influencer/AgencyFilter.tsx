'use client';

interface AgencyFilterProps {
  agencies: Array<{ key: string; name: string }>;
  value: string;
  onChange: (value: string) => void;
}

export default function AgencyFilter({ agencies, value, onChange }: AgencyFilterProps) {
  return (
    <select
      className="inf-dash-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All Agencies</option>
      {agencies.map((agency) => (
        <option key={agency.key} value={agency.key}>
          {agency.name}
        </option>
      ))}
    </select>
  );
}

