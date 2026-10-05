import { useEffect, useId, useRef, useState } from "react";
import ParticleField from "./ParticleField";
import { useTheme } from "../lib/theme";

/** 数字滚动动效：挂载/数值变化时从 0 缓动到目标值 */
export function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const from = prev.current;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (value - from) * eased;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{format ? format(display) : Math.round(display).toLocaleString("zh-CN")}</>;
}

/** 环形进度（回款率等），入场时从 0 扫到目标 */
export function Ring({
  pct,
  size = 96,
  stroke = 8,
  label,
  sub,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [anim, setAnim] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnim(Math.max(0, Math.min(100, pct))), 80);
    return () => clearTimeout(t);
  }, [pct]);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <defs>
            <linearGradient id={`rg-${gid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f89a55" />
              <stop offset="100%" stopColor="#ee7d2c" />
            </linearGradient>
          </defs>
          <circle cx={center} cy={center} r={r} fill="none" stroke="#2e3138" strokeWidth={stroke} />
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={`url(#rg-${gid})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - anim / 100)}
            transform={`rotate(-90 ${center} ${center})`}
            style={{
              transition: "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
              filter: "drop-shadow(0 0 6px rgba(238,125,44,0.55))",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="mono text-lg font-semibold num-glow">{Math.round(anim)}%</span>
        </div>
      </div>
      {label && <span className="text-xs text-dim">{label}</span>}
      {sub && <span className="text-[11px] text-faint mono">{sub}</span>}
    </div>
  );
}

/** 全局氛围背景：aurora 光斑 + 粒子 + 网格 + 顶部橙光（所有页面共用一层，主题联动） */
export function AmbientBackground() {
  const { theme } = useTheme();
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
      <div className="absolute inset-0 opacity-40">
        <ParticleField key={theme} density={0.35} mode={theme} />
      </div>
      <div className="ambient-grid absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_65%_at_50%_-12%,rgba(238,125,44,0.07),transparent_60%)]" />
    </div>
  );
}
