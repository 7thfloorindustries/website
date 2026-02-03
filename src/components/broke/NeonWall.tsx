'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

export default function NeonWall() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Trigger loaded state after mount for fade-in effect
    const timer = setTimeout(() => setLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="broke-home-wall">
      <Image
        src="/broke/wall.png"
        alt="Broke Neon Wall"
        fill
        className={`broke-lights ${loaded ? 'loaded' : ''}`}
        priority
        sizes="100vw"
        style={{ objectFit: 'cover' }}
      />
      <Image
        src="/broke/wall_off.png"
        alt="Broke Neon Wall Off"
        fill
        className={`broke-lights broke-lights-off ${loaded ? 'loaded flicker' : ''}`}
        priority
        sizes="100vw"
        style={{ objectFit: 'cover' }}
      />
    </div>
  );
}
