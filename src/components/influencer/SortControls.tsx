'use client';

interface SortControlsProps {
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
}

const DEFAULT_OPTIONS = [
  { value: 'views_desc', label: 'Most Views' },
  { value: 'budget_desc', label: 'Highest Budget' },
  { value: 'newest_desc', label: 'Newest' },
  { value: 'creators_desc', label: 'Most Creators' },
  { value: 'genre_asc', label: 'Genre A-Z' },
  { value: 'genre_desc', label: 'Genre Z-A' },
];

export default function SortControls({ value, onChange, options = DEFAULT_OPTIONS }: SortControlsProps) {
  return (
    <select
      className="inf-dash-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
