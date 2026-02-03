'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DateRangePreset } from '@/lib/dashboard/types';

interface DateRangePickerProps {
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomRangeChange?: (start: Date, end: Date) => void;
}

const presets: { value: DateRangePreset; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

export default function DateRangePicker({
  preset,
  onPresetChange,
  onCustomRangeChange,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const selectedLabel = preset === 'custom'
    ? 'Custom'
    : presets.find((p) => p.value === preset)?.label || '7 days';

  const handlePresetSelect = (value: DateRangePreset) => {
    onPresetChange(value);
    if (value !== 'custom') {
      setIsOpen(false);
    }
  };

  const handleCustomApply = () => {
    if (customStart && customEnd && onCustomRangeChange) {
      onCustomRangeChange(new Date(customStart), new Date(customEnd));
      setIsOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="broke-dash-btn"
        style={{
          background: 'var(--dash-background)',
          border: '1px solid var(--dash-border)',
          color: 'var(--dash-foreground)',
        }}
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
          style={{ color: 'var(--dash-muted)' }}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>{selectedLabel}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: 'var(--dash-muted)',
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 40,
              }}
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="broke-dash-dropdown"
            >
              <div className="broke-dash-dropdown-section">
                <div className="broke-dash-dropdown-label">Quick Select</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                  {presets.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => handlePresetSelect(p.value)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        transition: 'all 0.2s',
                        border: 'none',
                        background: preset === p.value ? 'rgba(255, 214, 0, 0.2)' : 'transparent',
                        color: preset === p.value ? 'var(--dash-accent)' : 'var(--dash-muted)',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="broke-dash-dropdown-section" style={{ padding: '0.75rem' }}>
                <div className="broke-dash-dropdown-label">Custom Range</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--dash-muted)', marginBottom: '0.25rem' }}>
                      Start
                    </label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="broke-dash-input"
                      style={{ paddingLeft: '0.75rem', paddingRight: '0.75rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--dash-muted)', marginBottom: '0.25rem' }}>
                      End
                    </label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="broke-dash-input"
                      style={{ paddingLeft: '0.75rem', paddingRight: '0.75rem' }}
                    />
                  </div>
                  <button
                    onClick={handleCustomApply}
                    disabled={!customStart || !customEnd}
                    className="broke-dash-btn broke-dash-btn-accent"
                    style={{ justifyContent: 'center' }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
