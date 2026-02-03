'use client';

import { motion } from 'framer-motion';
import type { LeaderboardEntry } from '@/lib/dashboard/types';
import { exportToCsv } from '@/lib/dashboard/exportCsv';

interface ExportButtonProps {
  data: LeaderboardEntry[];
  filename: string;
}

export default function ExportButton({ data, filename }: ExportButtonProps) {
  const handleExport = () => {
    exportToCsv(data, filename);
  };

  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleExport}
      disabled={data.length === 0}
      className="broke-dash-btn broke-dash-btn-accent"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Export CSV
    </motion.button>
  );
}
