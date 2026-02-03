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

    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    if (isTouchDevice) {
      return;
    }

    // Add body class
    document.body.classList.add('dashboard-cursor-active');

    // Create a transparent 1x1 cursor image (base64 encoded transparent PNG)
    const transparentCursor = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // Inject a style tag to use transparent cursor instead of none
    const styleEl = document.createElement('style');
    styleEl.id = 'cursor-nuke';
    styleEl.textContent = `
      html, body, *, *::before, *::after {
        cursor: url('${transparentCursor}') 0 0, none !important;
      }
    `;
    document.head.appendChild(styleEl);

    return () => {
      document.body.classList.remove('dashboard-cursor-active');
      const style = document.getElementById('cursor-nuke');
      if (style) style.remove();
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
