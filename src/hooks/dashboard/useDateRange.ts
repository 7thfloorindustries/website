'use client';

import { useState, useCallback, useMemo } from 'react';
import type { DateRange, DateRangePreset } from '@/lib/dashboard/types';

const STORAGE_KEY = 'broke-dashboard-date-range';

function getDateRangeForPreset(preset: DateRangePreset): DateRange {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);

  switch (preset) {
    case '7d':
      start.setDate(start.getDate() - 7);
      return { start, end, label: 'Last 7 days', days: 7 };
    case '14d':
      start.setDate(start.getDate() - 14);
      return { start, end, label: 'Last 14 days', days: 14 };
    case '30d':
      start.setDate(start.getDate() - 30);
      return { start, end, label: 'Last 30 days', days: 30 };
    case '90d':
      start.setDate(start.getDate() - 90);
      return { start, end, label: 'Last 90 days', days: 90 };
    case 'custom':
    default:
      start.setDate(start.getDate() - 7);
      return { start, end, label: 'Custom', days: 7 };
  }
}

function loadStoredPreset(): DateRangePreset {
  if (typeof window === 'undefined') return '7d';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const preset = stored as DateRangePreset;
      if (['7d', '14d', '30d', '90d', 'custom'].includes(preset)) {
        return preset;
      }
    }
  } catch {
    // localStorage not available
  }
  return '7d';
}

function savePreset(preset: DateRangePreset): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, preset);
  } catch {
    // localStorage not available
  }
}

export function useDateRange() {
  const [preset, setPresetState] = useState<DateRangePreset>(() => loadStoredPreset());
  const [customRange, setCustomRange] = useState<DateRange | null>(null);

  const dateRange = useMemo<DateRange>(() => {
    if (preset === 'custom' && customRange) {
      return customRange;
    }
    return getDateRangeForPreset(preset);
  }, [preset, customRange]);

  const setPreset = useCallback((newPreset: DateRangePreset) => {
    setPresetState(newPreset);
    savePreset(newPreset);
  }, []);

  const setCustomDateRange = useCallback((start: Date, end: Date) => {
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    setCustomRange({
      start,
      end,
      label: 'Custom',
      days,
    });
    setPreset('custom');
  }, [setPreset]);

  const dateLabel = useMemo(() => {
    return `${dateRange.days}d`;
  }, [dateRange.days]);

  return {
    dateRange,
    preset,
    setPreset,
    setCustomDateRange,
    dateLabel,
    presets: ['7d', '14d', '30d', '90d'] as const,
  };
}
