'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';

export default function BrokeCursor() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [recoil, setRecoil] = useState(false);
  const cursorRef = useRef<HTMLImageElement>(null);
  const pathname = usePathname();

  // Don't render on dashboard pages (they have their own cursor)
  const isDashboard = pathname?.startsWith('/broke/dashboard');

  useEffect(() => {
    // Don't show JS cursor on touch devices or on dashboard
    if (window.matchMedia('(pointer: coarse)').matches || isDashboard) return;

    setMounted(true);

    const onMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };

    const onLeave = () => setVisible(false);
    const onEnter = () => setVisible(true);

    const onMouseDown = (e: MouseEvent) => {
      // Only trigger recoil for left click
      if (e.button === 0) {
        setRecoil(true);
      }
    };

    const onMouseUp = () => {
      setRecoil(false);
    };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDashboard]);

  // Don't render on dashboard (has its own cursor) or if not mounted
  if (isDashboard || !mounted) return null;

  return (
    <img
      ref={cursorRef}
      // Use 2x resolution for retina displays
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
        // Hotspot: normal (33,15), active (30,13) - recoil shifts 3px right, 2px down
        transform: recoil ? 'translate(-30px, -13px)' : 'translate(-33px, -15px)',
        pointerEvents: 'none',
        zIndex: 99999,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.1s', // No transform transition - instant snap like CSS cursor
        willChange: 'transform, left, top',
      }}
    />
  );
}
