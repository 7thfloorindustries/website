'use client';

const GENRES = [
  'Unclassified',
  'Hip-Hop/Rap',
  'Pop',
  'R&B',
  'Country',
  'Rock',
  'Electronic/EDM',
  'Latin',
  'K-Pop',
  'Alternative',
  'Indie',
  'Afrobeats',
  'Reggaeton',
  'Gospel',
  'Folk',
  'Brand',
  'Other',
];

interface GenreFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export default function GenreFilter({ value, onChange }: GenreFilterProps) {
  return (
    <select
      className="inf-dash-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All Genres</option>
      {GENRES.map((genre) => (
        <option key={genre} value={genre}>{genre}</option>
      ))}
    </select>
  );
}
