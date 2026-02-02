'use client';

import { useEffect, useRef } from 'react';

interface AreaChartProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  color?: string;
}

export const PLATFORM_COLORS: Record<string, string> = {
  'all': '#C4A35A',
  'TikTok': '#00f2ea',
  'X / Twitter': '#1DA1F2',
  'Instagram': '#E1306C',
  'YouTube': '#FF0000',
  'Facebook': '#4267B2',
};

export default function AreaChart({ data, width = 400, height = 200, className = '', color }: AreaChartProps) {
  const chartColor = color || '#C4A35A';
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set actual size in memory (scaled for retina)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Calculate points
    const max = Math.max(...data);
    const min = 0;
    const range = max - min || 1;
    const padding = { top: 20, right: 20, bottom: 30, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const points = data.map((value, index) => ({
      x: padding.left + (index / (data.length - 1)) * chartWidth,
      y: padding.top + chartHeight - ((value - min) / range) * chartHeight
    }));

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // Draw Y-axis labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const value = max - (max / 4) * i;
      const y = padding.top + (chartHeight / 4) * i;
      const label = value >= 1000000 ? (value / 1000000).toFixed(1) + 'M' :
                    value >= 1000 ? (value / 1000).toFixed(0) + 'K' :
                    value.toFixed(0);
      ctx.fillText(label, padding.left - 10, y + 4);
    }

    // Create gradient fill - convert hex to rgba
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 196, g: 163, b: 90 };
    };
    const rgb = hexToRgb(chartColor);
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`);
    gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.02)`);

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(points[0].x, height - padding.bottom);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = chartColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw glow effect
    ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = chartColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw data points
    points.forEach((point, index) => {
      if (index % 2 === 0 || index === points.length - 1) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = chartColor;
        ctx.fill();
      }
    });

  }, [data, width, height, chartColor]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%', maxWidth: width, maxHeight: height }}
    />
  );
}
