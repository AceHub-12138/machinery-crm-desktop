import { useEffect, useRef } from "react";

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  brand: boolean;
}

/** 橙灰粒子场：登录页 / 全局氛围背景（低负载 canvas 2D，尊重系统减少动效设置） */
export default function ParticleField({
  density = 1,
  mode = "dark",
  className = "",
}: {
  density?: number;
  mode?: "dark" | "light";
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dotGray = mode === "light" ? "rgba(95,100,110,0.4)" : "rgba(150,154,162,0.5)";
    const dotBrand = mode === "light" ? "rgba(229,111,20,0.55)" : "rgba(238,125,44,0.75)";
    const lineGray = (a: number) => `rgba(120,124,132,${a})`;
    const lineBrand = (a: number) => `rgba(238,125,44,${a})`;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dots: P[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(96, Math.floor(((w * h) / 16000) * density));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 0.8 + Math.random() * 1.6,
        brand: Math.random() < 0.22,
      }));
    };

    const step = () => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < -10) d.x = w + 10;
        if (d.x > w + 10) d.x = -10;
        if (d.y < -10) d.y = h + 10;
        if (d.y > h + 10) d.y = -10;
      }
      // 连线
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i];
          const b = dots[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < 95) {
            const alpha = (1 - dist / 95) * (mode === "light" ? 0.1 : 0.14);
            ctx.strokeStyle = a.brand || b.brand ? lineBrand(alpha) : lineGray(alpha);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const d of dots) {
        ctx.fillStyle = d.brand ? dotBrand : dotGray;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(step);
    };

    resize();
    step();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) step();
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density, mode]);

  return <canvas ref={ref} className={`w-full h-full ${className}`} />;
}
