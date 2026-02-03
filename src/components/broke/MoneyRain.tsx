'use client';

import { useEffect } from 'react';

// Exact copy of original physics from broke.nyc
export default function MoneyRain() {
  useEffect(() => {
    // Original constants
    const random = Math.random;
    const cos = Math.cos;
    const sin = Math.sin;
    const PI = Math.PI;
    const TWO_PI = PI * 2;

    let animationId: number | undefined = undefined;
    const dollars: Dollar[] = [];
    const BILLS_PER_SPAWN = 1;
    const MIN_SCALE = 16;
    const SCALE_RANGE = 32 - MIN_SCALE;
    const PERSPECTIVE = 150;
    const SPLINE_POINTS = 12;
    const AMPLITUDE = -100;
    const DELAY_RANGE = 0.4;
    const DELAY_BASE = 0.7 - DELAY_RANGE;
    const TIMESCALE = 1.4;
    const GRAVITY_DELAY = 0.7;
    const GRAVITY = 0.04;
    const SPAWN_INTERVAL = 0.1;

    // Interpolation function
    function interpolate(a: number, b: number, f: number): number {
      return ((1 - cos(PI * f)) / 2) * (b - a) + a;
    }

    // Spline generation (exact copy)
    const m = 1 / SPLINE_POINTS;
    const N = m + m;

    function generateSplineX(): number[] {
      const t = [m, 1 - m];
      let s = 1 - N;
      const f = [0, 1];

      while (s > 0) {
        const u = s * random();
        let i, e, n, o, h;

        for (i = 0, e = t.length, s = 0; i < e; i += 2) {
          o = t[i];
          h = t[i + 1];
          n = h - o;
          if (u < s + n) {
            f.push(u + o - s);
            break;
          }
          s += n;
        }

        const d = f[f.length - 1] - m;
        const r = f[f.length - 1] + m;

        for (i = t.length - 1; i > 0; i -= 2) {
          e = i - 1;
          o = t[e];
          h = t[i];
          if (o >= d && o < r) {
            if (h > r) {
              t[e] = r;
            } else {
              t.splice(e, 2);
            }
          } else if (o < d && h > d) {
            if (h <= r) {
              t[i] = d;
            } else {
              t.splice(i, 0, d, r);
            }
          }
        }

        s = 0;
        for (i = 0, e = t.length; i < e; i += 2) {
          s += t[i + 1] - t[i];
        }
      }

      return f.sort((a, b) => a - b);
    }

    interface Dollar {
      frame: number;
      outer: HTMLDivElement;
      inner: HTMLDivElement;
      outerStyle: CSSStyleDeclaration;
      innerStyle: CSSStyleDeclaration;
      axis: string;
      theta: number;
      dTheta: number;
      x: number;
      y: number;
      dx: number;
      dy: number;
      splineX: number[];
      splineY: number[];
      gravityDelay: number;
    }

    // Container
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '0';
    container.style.overflow = 'visible';
    container.style.zIndex = '9999';
    container.style.pointerEvents = 'none';

    const DOLLAR_IMG = '/broke/dollar.jpg';

    function createDollar(imgUrl: string, x: number, y: number, dx: number, dy: number): Dollar {
      const outer = document.createElement('div');
      const inner = document.createElement('div');
      outer.appendChild(inner);

      const outerStyle = outer.style;
      const innerStyle = inner.style;

      outerStyle.position = 'absolute';
      outerStyle.width = (MIN_SCALE + SCALE_RANGE) + 'px';
      outerStyle.height = (MIN_SCALE + SCALE_RANGE) + 'px';
      outerStyle.aspectRatio = '316 / 136';
      innerStyle.boxShadow = '10px 25px 50px rgba(0, 0, 0, 0.3)';
      innerStyle.width = '100%';
      innerStyle.height = '100%';
      innerStyle.aspectRatio = '316 / 136';
      innerStyle.background = `url(${imgUrl}) 0 0`;
      innerStyle.backgroundSize = 'cover';
      outerStyle.perspective = PERSPECTIVE + 'px';
      outerStyle.transform = 'rotate(' + (360 * random()) + 'deg)';

      const axis = 'rotate3D(' + cos(360 * random()) + ',' + cos(360 * random()) + ',0,';
      const theta = 360 * random();
      const dTheta = DELAY_RANGE + DELAY_BASE * random();

      innerStyle.transform = axis + theta + 'deg)';

      outerStyle.left = x + 'px';
      outerStyle.top = y + 'px';

      const splineX = generateSplineX();
      const splineY: number[] = [];
      for (let o = 1, h = splineX.length - 1; o < h; ++o) {
        splineY[o] = AMPLITUDE * random();
      }
      splineY[0] = splineY[splineX.length - 1] = AMPLITUDE * random();

      return {
        frame: 0,
        outer,
        inner,
        outerStyle,
        innerStyle,
        axis,
        theta,
        dTheta,
        x,
        y,
        dx,
        dy,
        splineX,
        splineY,
        gravityDelay: GRAVITY_DELAY
      };
    }

    function updateDollar(dollar: Dollar, windowHeight: number, deltaTime: number): boolean {
      dollar.frame += deltaTime;
      dollar.x += dollar.dx * deltaTime;
      dollar.y += dollar.dy * deltaTime;
      dollar.theta += dollar.dTheta * deltaTime;

      if (dollar.gravityDelay > 0) {
        dollar.gravityDelay -= deltaTime;
      } else {
        dollar.dx *= 0.98;
        dollar.dy += GRAVITY;
      }

      let a = (dollar.frame % 7777) / 7777;
      let g = 0;
      let v = 1;

      while (a >= dollar.splineX[v]) {
        g = v++;
      }

      const b = interpolate(
        dollar.splineY[g],
        dollar.splineY[v],
        (a - dollar.splineX[g]) / (dollar.splineX[v] - dollar.splineX[g])
      );

      a *= TWO_PI;

      dollar.outerStyle.left = (dollar.x + b * cos(a)) + 'px';
      dollar.outerStyle.top = (dollar.y + b * sin(a)) + 'px';
      dollar.innerStyle.transform = dollar.axis + dollar.theta + 'deg)';

      return dollar.y > windowHeight + dollar.outer.offsetHeight + 100;
    }

    function spawnDollar(x: number, y: number) {
      if (!animationId) {
        document.body.appendChild(container);
      }

      for (let i = 0; i < BILLS_PER_SPAWN; i++) {
        const dx = -0.5 + random() * -0.8;
        const dy = -0.5 + random() * -0.8;
        const dollar = createDollar(DOLLAR_IMG, x, y, dx, dy);
        dollars.push(dollar);
        container.appendChild(dollar.outer);
      }

      if (!animationId) {
        let lastTime: number | undefined;

        function animate(timestamp: number) {
          const deltaTime = lastTime ? timestamp - lastTime : 0;
          lastTime = timestamp;

          const windowHeight = window.innerHeight;

          for (let i = dollars.length - 1; i >= 0; --i) {
            if (updateDollar(dollars[i], windowHeight, deltaTime / TIMESCALE)) {
              container.removeChild(dollars[i].outer);
              dollars.splice(i, 1);
            }
          }

          if (dollars.length > 0) {
            animationId = requestAnimationFrame(animate);
          } else {
            document.body.removeChild(container);
            animationId = undefined;
          }
        }

        animationId = requestAnimationFrame(animate);
      }
    }

    let mouseX = 0;
    let mouseY = 0;
    let isActive = false;
    let spawnTimeout: ReturnType<typeof setTimeout> | null = null;

    function spawnLoop() {
      if (isActive) {
        spawnDollar(mouseX, mouseY);
        spawnTimeout = setTimeout(spawnLoop, (SPAWN_INTERVAL + Math.random() * 0.05) * 1000);
      }
    }

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (
        target.closest('nav') ||
        target.closest('.broke-nav-mobile') ||
        target.closest('.broke-home-footer')
      ) {
        return;
      }

      // On dashboard, only spray money if Money Mode is enabled
      const isDashboard = window.location.pathname.startsWith('/broke/dashboard');
      if (isDashboard) {
        const cursorMode = localStorage.getItem('broke-dashboard-cursor-mode');
        if (cursorMode !== 'money') {
          return; // Don't spray with logo cursor
        }
      }

      if (e.button === 0) {
        isActive = true;
        mouseX = e.clientX;
        mouseY = e.clientY;
        spawnLoop();
      }
    }

    function handleMouseMove(e: MouseEvent) {
      if (isActive) {
        mouseX = e.clientX;
        mouseY = e.clientY;
      }
    }

    function handleMouseUp() {
      isActive = false;
      if (spawnTimeout) {
        clearTimeout(spawnTimeout);
        spawnTimeout = null;
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      isActive = false;
      if (spawnTimeout) clearTimeout(spawnTimeout);
      if (animationId) {
        cancelAnimationFrame(animationId);
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      }
    };
  }, []);

  return null;
}
