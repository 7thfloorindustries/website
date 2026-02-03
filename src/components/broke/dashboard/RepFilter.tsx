'use client';

import { motion } from 'framer-motion';

interface RepFilterProps {
  reps: string[];
  selectedRep: string | null;
  onChange: (rep: string | null) => void;
}

export default function RepFilter({ reps, selectedRep, onChange }: RepFilterProps) {
  if (reps.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
    >
      <label style={{
        fontSize: '0.7rem',
        color: 'var(--dash-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        Rep:
      </label>
      <select
        value={selectedRep || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="broke-dash-select"
      >
        <option value="">All Reps</option>
        {reps.map((rep) => (
          <option key={rep} value={rep}>
            {rep}
          </option>
        ))}
      </select>
    </motion.div>
  );
}
