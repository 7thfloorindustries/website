'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { useCursorMode } from './CursorContext';

export default function DashboardCursor() {
  const { mode } = useCursorMode();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [recoil, setRecoil] = useState(false);

  useEffect(() => {
    // Don't show JS cursor on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) return;

    setMounted(true);
    setVisible(true); // Start visible

    // Note: custom-cursor-active class is managed by CursorProvider for stability

    const onMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };

    // Keep cursor always visible - hiding causes issues with tab switching
    const onLeave = () => {}; // Do nothing
    const onEnter = () => setVisible(true);

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        setRecoil(true);
      }
    };

    const onMouseUp = () => {
      setRecoil(false);
    };

    // Handle tab visibility changes (when returning from external link)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setVisible(true);
      }
    };

    // Handle window focus (when returning to tab)
    const onFocus = () => {
      setVisible(true);
    };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (!mounted) return null;

  // Money mode cursor (the cash gun)
  if (mode === 'money') {
    return (
      <img
        src="/broke/cursor-cash@2x.png"
        alt=""
        width={80}
        height={125}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          width: 80,
          height: 125,
          transform: recoil ? 'translate(-30px, -13px)' : 'translate(-33px, -15px)',
          pointerEvents: 'none',
          zIndex: 99999,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.1s',
          willChange: 'transform, left, top',
        }}
      />
    );
  }

  // Logo mode cursor (BROKE coin) - no recoil, just a simple pointer
  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: 32,
        height: 34,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 99999,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.1s',
        willChange: 'left, top',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
      }}
    >
      <Image
        src="/broke/logo.svg"
        alt=""
        width={32}
        height={34}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
