'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type CursorMode = 'logo' | 'money';

interface CursorContextType {
  mode: CursorMode;
  setMode: (mode: CursorMode) => void;
  toggleMode: () => void;
}

const CursorContext = createContext<CursorContextType | undefined>(undefined);

const STORAGE_KEY = 'broke-dashboard-cursor-mode';

export function CursorProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<CursorMode>('logo');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Load saved preference
    const saved = localStorage.getItem(STORAGE_KEY) as CursorMode | null;
    if (saved === 'money' || saved === 'logo') {
      setModeState(saved);
    }
    setMounted(true);

    // Only hide native cursor on hover-capable (non-touch) devices
    const canHover = window.matchMedia('(hover: hover)').matches;
    if (!canHover) {
      return;
    }

    document.body.classList.add('custom-cursor-active');

    return () => {
      document.body.classList.remove('custom-cursor-active');
    };
  }, []);

  const setMode = (newMode: CursorMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  };

  const toggleMode = () => {
    const newMode = mode === 'logo' ? 'money' : 'logo';
    setMode(newMode);
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <CursorContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </CursorContext.Provider>
  );
}

export function useCursorMode() {
  const context = useContext(CursorContext);
  if (!context) {
    throw new Error('useCursorMode must be used within a CursorProvider');
  }
  return context;
}
