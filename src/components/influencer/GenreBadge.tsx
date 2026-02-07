const GENRE_COLORS: Record<string, string> = {
  'Unclassified': '#9CA3AF',
  'Hip-Hop/Rap': '#9333EA',
  'Pop': '#EC4899',
  'R&B': '#F59E0B',
  'Country': '#84CC16',
  'Rock': '#EF4444',
  'Electronic/EDM': '#06B6D4',
  'Latin': '#F97316',
  'K-Pop': '#A855F7',
  'Alternative': '#6366F1',
  'Indie': '#14B8A6',
  'Afrobeats': '#22C55E',
  'Reggaeton': '#FB923C',
  'Gospel': '#FBBF24',
  'Folk': '#A3E635',
  'Brand': '#94A3B8',
  'Other': '#6B7280',
};

interface GenreBadgeProps {
  confidence?: number;
  genre: string;
  showConfidence?: boolean;
}

export default function GenreBadge({ genre, confidence, showConfidence = false }: GenreBadgeProps) {
  const color = GENRE_COLORS[genre] || GENRE_COLORS['Other'];
  const confidencePct = Number.isFinite(confidence)
    ? Math.round(Math.max(0, Math.min(1, Number(confidence))) * 100)
    : null;

  return (
    <span
      className="inf-dash-genre-badge"
      style={{
        backgroundColor: `${color}15`,
        color: color,
        borderColor: `${color}40`,
      }}
    >
      {genre}
      {showConfidence && confidencePct != null && (
        <span style={{ marginLeft: '0.3rem', opacity: 0.75 }}>
          {confidencePct}%
        </span>
      )}
    </span>
  );
}
