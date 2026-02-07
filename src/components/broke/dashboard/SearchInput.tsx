'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchInput({ value, onChange, placeholder = 'Search fanpages...' }: SearchInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync local state when parent value changes (e.g. external clear)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Debounce: propagate to parent after 300ms of inactivity
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (inputValue !== value) {
        onChange(inputValue);
      }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [inputValue, onChange, value]);

  const handleClear = useCallback(() => {
    clearTimeout(timerRef.current);
    setInputValue('');
    onChange('');
  }, [onChange]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        transition: 'all 0.2s',
        boxShadow: isFocused ? '0 0 0 1px rgba(255, 214, 0, 0.5)' : 'none',
        borderRadius: '8px',
      }}
    >
      <span style={{
        position: 'absolute',
        left: '12px',
        color: 'var(--dash-muted)',
        pointerEvents: 'none',
      }}>
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
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </span>

      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className="broke-dash-input"
        aria-label={placeholder}
      />

      {inputValue && (
        <button
          onClick={handleClear}
          aria-label="Clear search"
          style={{
            position: 'absolute',
            right: '12px',
            color: 'var(--dash-muted)',
            background: 'none',
            border: 'none',
            transition: 'color 0.2s',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      )}
    </motion.div>
  );
}
