"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Elevator ding sound using Web Audio API
function playElevatorDing() {
  try {
    const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Classic elevator ding - two-tone chime
    oscillator.frequency.setValueAtTime(830, audioContext.currentTime); // G#5
    oscillator.frequency.setValueAtTime(1046, audioContext.currentTime + 0.1); // C6

    oscillator.type = 'sine';

    // Envelope for pleasant ding
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.8);
  } catch {
    // Silently fail if audio isn't available
  }
}

interface ElevatorLoaderProps {
  onComplete: () => void;
  targetFloor?: number;
  startFloor?: number;
}

export default function ElevatorLoader({ onComplete, targetFloor = 7, startFloor = 1 }: ElevatorLoaderProps) {
  const [floor, setFloor] = useState(startFloor);
  const [prevFloor, setPrevFloor] = useState(startFloor);
  const [isExiting, setIsExiting] = useState(false);
  const [arrowPulsing, setArrowPulsing] = useState(true);
  const [shake, setShake] = useState(false);
  const [floorLine, setFloorLine] = useState(false);
  const hasInteractedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Track user interaction for sound
  useEffect(() => {
    const handleInteraction = () => {
      hasInteractedRef.current = true;
    };
    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    const floorsToTravel = targetFloor - startFloor;

    // Generate floor times dynamically based on target floor
    const floorTimes: number[] = [0];
    for (let i = 1; i <= floorsToTravel; i++) {
      // Slower on last floor (slowing down effect)
      const delay = i === floorsToTravel ? 600 : 400;
      floorTimes.push(floorTimes[i - 1] + delay);
    }

    floorTimes.forEach((time, index) => {
      if (index === 0) return;

      // Trigger floor line animation between floors
      timers.push(setTimeout(() => {
        setFloorLine(true);
        setTimeout(() => setFloorLine(false), 150);
      }, time - 200));

      // Trigger shake and floor change
      timers.push(setTimeout(() => {
        setShake(true);
        setTimeout(() => setShake(false), 100);
        setPrevFloor(startFloor + index - 1);
        setFloor(startFloor + index);
      }, time));
    });

    const totalTime = floorTimes[floorTimes.length - 1];

    // Arrival - stop arrow, play ding
    timers.push(setTimeout(() => {
      setArrowPulsing(false);
      if (hasInteractedRef.current) {
        playElevatorDing();
      }
    }, totalTime));

    // Hold for 0.5s, then open doors
    timers.push(setTimeout(() => {
      setIsExiting(true);
    }, totalTime + 500));

    // Complete after doors open
    timers.push(setTimeout(() => {
      onCompleteRef.current();
    }, totalTime + 1100));

    return () => timers.forEach(clearTimeout);
  }, [targetFloor, startFloor]);

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden">
      {/* Top half (door) */}
      <motion.div
        initial={{ y: 0 }}
        animate={{ y: isExiting ? "-100%" : 0 }}
        transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
        className="absolute inset-x-0 top-0 h-1/2 bg-[#0A0A0A]"
        style={{
          borderBottom: isExiting ? '2px solid rgba(196, 163, 90, 0.3)' : 'none',
        }}
      />

      {/* Bottom half (door) */}
      <motion.div
        initial={{ y: 0 }}
        animate={{ y: isExiting ? "100%" : 0 }}
        transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
        className="absolute inset-x-0 bottom-0 h-1/2 bg-[#0A0A0A]"
        style={{
          borderTop: isExiting ? '2px solid rgba(196, 163, 90, 0.3)' : 'none',
        }}
      />

      {/* Floor line passing effect */}
      <AnimatePresence>
        {floorLine && (
          <motion.div
            initial={{ y: "-100%", opacity: 0.3 }}
            animate={{ y: "100%", opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "linear" }}
            className="absolute inset-x-0 h-[1px] bg-white/20 z-10"
            style={{ top: "50%" }}
          />
        )}
      </AnimatePresence>

      {/* Main content - centered indicator */}
      <motion.div
        animate={{
          x: shake ? [0, -2, 2, -1, 1, 0] : 0,
          y: shake ? [0, 1, -1, 0.5, -0.5, 0] : 0,
        }}
        transition={{ duration: 0.1 }}
        className="fixed inset-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: isExiting ? 0 : 1, transition: 'opacity 0.3s' }}
      >
        {/* Brushed metal frame */}
        <div
          className="relative p-8 rounded-sm"
          style={{
            background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 50%, #1a1a1a 100%)',
            boxShadow: `
              inset 0 1px 0 rgba(255,255,255,0.05),
              inset 0 -1px 0 rgba(0,0,0,0.5),
              0 0 40px rgba(0,0,0,0.8),
              0 0 80px rgba(0,0,0,0.4)
            `,
            border: '1px solid rgba(255,255,255,0.03)',
          }}
        >
          {/* Inner chrome bezel */}
          <div
            className="relative px-12 py-6"
            style={{
              background: 'linear-gradient(180deg, #151515 0%, #0a0a0a 100%)',
              boxShadow: `
                inset 0 2px 4px rgba(0,0,0,0.8),
                inset 0 -1px 0 rgba(255,255,255,0.02)
              `,
              borderRadius: '2px',
            }}
          >
            {/* Up arrow */}
            <motion.div
              animate={arrowPulsing ? {
                opacity: [0.6, 1, 0.6],
                textShadow: [
                  '0 0 10px rgba(196, 163, 90, 0.3)',
                  '0 0 20px rgba(196, 163, 90, 0.6), 0 0 30px rgba(196, 163, 90, 0.4)',
                  '0 0 10px rgba(196, 163, 90, 0.3)',
                ],
              } : { opacity: 1 }}
              transition={{ duration: 0.8, repeat: arrowPulsing ? Infinity : 0, ease: "easeInOut" }}
              className="text-center mb-4 text-[#C4A35A]"
              style={{
                fontSize: '24px',
                fontWeight: 300,
              }}
            >
              ▲
            </motion.div>

            {/* Top line */}
            <div
              className="w-20 h-[1px] mx-auto mb-4"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(196, 163, 90, 0.4), transparent)',
              }}
            />

            {/* Floor number display */}
            <div className="relative h-[100px] w-[80px] mx-auto overflow-hidden">
              {/* Previous floor (sliding out) */}
              <motion.div
                key={`prev-${prevFloor}`}
                initial={{ y: 0 }}
                animate={{ y: floor !== prevFloor ? -120 : 0 }}
                transition={{ duration: 0.3, ease: [0.76, 0, 0.24, 1] }}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
                  fontSize: '80px',
                  fontWeight: 300,
                  color: '#C4A35A',
                  textShadow: `
                    0 0 30px rgba(196, 163, 90, 0.5),
                    0 0 60px rgba(196, 163, 90, 0.3),
                    0 0 2px rgba(196, 163, 90, 0.8)
                  `,
                  lineHeight: 1,
                }}
              >
                {floor === prevFloor ? floor : prevFloor}
              </motion.div>

              {/* Current floor (sliding in) */}
              {floor !== prevFloor && (
                <motion.div
                  key={`current-${floor}`}
                  initial={{ y: 120 }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.3, ease: [0.76, 0, 0.24, 1] }}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
                    fontSize: '80px',
                    fontWeight: 300,
                    color: '#C4A35A',
                    textShadow: `
                      0 0 30px rgba(196, 163, 90, 0.5),
                      0 0 60px rgba(196, 163, 90, 0.3),
                      0 0 2px rgba(196, 163, 90, 0.8)
                    `,
                    lineHeight: 1,
                  }}
                >
                  {floor}
                </motion.div>
              )}

              {/* LCD backlight glow effect */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(196, 163, 90, 0.08) 0%, transparent 70%)',
                }}
              />
            </div>

            {/* Bottom line */}
            <div
              className="w-20 h-[1px] mx-auto mt-4"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(196, 163, 90, 0.4), transparent)',
              }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
