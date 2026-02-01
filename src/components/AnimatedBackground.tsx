"use client";

export default function AnimatedBackground() {
  return (
    <>
      {/* Static subtle radial gradient - dark center fading to black */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% 30%, rgba(20, 20, 25, 0.8) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 70% 60%, rgba(15, 15, 20, 0.5) 0%, transparent 40%),
            #0A0A0A
          `,
        }}
      />

      {/* Very subtle static noise texture */}
      <div
        className="fixed inset-0 pointer-events-none z-[1] opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </>
  );
}
