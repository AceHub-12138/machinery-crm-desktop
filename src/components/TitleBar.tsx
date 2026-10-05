import { useEffect, useState } from "react";
import { Moon, Sun, Minus, Square, X } from "lucide-react";
import { useTheme } from "../lib/theme";

/** 无边框窗口的自绘标题栏：品牌 + 连接状态 + 主题切换 + 窗口控制按钮 */
export default function TitleBar({ serverUrl, connected }: { serverUrl: string; connected: boolean }) {
  const { theme, toggle } = useTheme();
  const [clock, setClock] = useState("");
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (x: number) => String(x).padStart(2, "0");
      setClock(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`);
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);

  const ctrlBtn =
    "no-drag-region flex h-full w-11 items-center justify-center text-faint transition-colors";

  return (
    <div
      className="drag-region relative flex h-9 shrink-0 items-center justify-between border-b border-line pl-4"
      style={{ background: "var(--titlebar-bg)" }}
    >
      <div className="pointer-events-none flex items-center gap-2.5">
        <span className="text-xs font-medium text-dim">大川Pro 工作台</span>
        <span className="mono flex items-center gap-1.5 text-[11px] text-faint">
          {/* 连接状态用静态小圆点：呼吸/扩散动效曾被误读为异常信号（绿色律动），保持安静 */}
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-ok" : "bg-bad"}`} />
          {serverUrl ? (connected ? "已连接" : "连接中断") : "未配置服务器"}
        </span>
      </div>
      <div className="pointer-events-none mono absolute left-1/2 -translate-x-1/2 text-[11px] text-faint">{clock}</div>

      <div className="no-drag-region flex h-full items-center">
        <button
          title={theme === "dark" ? "切换为浅色主题" : "切换为深色主题"}
          onClick={toggle}
          className="mr-1 flex h-6 w-6 items-center justify-center rounded-full text-faint transition-colors hover:bg-panel2 hover:text-brand"
        >
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>
        <button className={`${ctrlBtn} hover:bg-panel2 hover:text-ink`} title="最小化" onClick={() => window.dachuan.windowControl("minimize")}>
          <Minus size={14} />
        </button>
        <button
          className={`${ctrlBtn} hover:bg-panel2 hover:text-ink`}
          title={maximized ? "还原" : "最大化"}
          onClick={async () => {
            const res = await window.dachuan.windowControl("toggle-maximize");
            setMaximized(!!res?.maximized);
          }}
        >
          <Square size={11} strokeWidth={2.5} />
        </button>
        <button className={`${ctrlBtn} hover:!bg-bad hover:text-white`} title="关闭" onClick={() => window.dachuan.windowControl("close")}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
