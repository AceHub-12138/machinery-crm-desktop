import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import ParticleField from "../components/ParticleField";
import { Spinner } from "../components/ui";
import { setServerUrl, getServerUrl, cacheUser } from "../lib/api";
import { useTheme } from "../lib/theme";
import logoBadge from "../assets/logo-badge.png";
import type { SessionUser } from "../lib/ipc";

export default function LoginView({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tiltRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // OS 风：卡片随光标轻微视差倾斜（rAF 节流，尊重系统减少动效）
  const onMouseMove = (e: React.MouseEvent) => {
    const el = tiltRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cx = e.clientX / window.innerWidth - 0.5;
    const cy = e.clientY / window.innerHeight - 0.5;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(1000px) rotateX(${(-cy * 2.6).toFixed(2)}deg) rotateY(${(cx * 2.6).toFixed(2)}deg)`;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!email.trim() || !password) {
      setError("请输入账号和密码");
      return;
    }
    setBusy(true);
    try {
      setServerUrl(getServerUrl()); // 确保本地存有默认服务器
      const res = await window.dachuan.login({ baseUrl: getServerUrl(), email: email.trim(), password });
      if (!res.ok || !res.user) {
        setError(res.error || "账号或密码不正确");
        return;
      }
      cacheUser(res.user);
      onLogin(res.user);
    } catch (err) {
      setError(`登录失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative h-full flex items-center justify-center overflow-hidden" onMouseMove={onMouseMove}>
      {/* 环境层：aurora 光斑 + 粒子 + 网格 + 主题色暗角 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="ambient-grid absolute inset-0" />
      </div>
      <div className="absolute inset-0 opacity-70 pointer-events-none">
        <ParticleField mode={theme} />
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, transparent 32%, var(--color-bg) 100%)" }}
      />
      {/* 无边框窗口顶部拖拽条：必须盖在画布/遮罩之上，否则收不到鼠标拖拽 */}
      <div className="drag-region absolute top-0 left-0 right-0 h-9 z-30" />

      <div ref={tiltRef} className="relative z-10 will-change-transform" style={{ transition: "transform 0.18s ease-out" }}>
        <form onSubmit={submit} className="login-card-in w-[380px] panel panel-glow px-8 py-9">
          <div className="flex flex-col items-center gap-2.5 mb-7">
            <img
              src={logoBadge}
              alt="大川机床"
              className="login-drop logo-breath w-16 h-16 rounded-xl shadow-[0_0_28px_rgba(238,125,44,0.25)]"
            />
            <div className="fade-up text-lg font-semibold tracking-wide mt-1" style={{ animationDelay: "180ms" }}>
              大川Pro 桌面工作台
            </div>
            <div className="fade-up text-xs text-faint mono" style={{ animationDelay: "240ms" }}>
              DACHUANPRO · CRM / ERP
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="fade-up flex flex-col gap-1.5" style={{ animationDelay: "260ms" }}>
              <span className="label">账号</span>
              <input
                className="input"
                placeholder="平台登录账号"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                spellCheck={false}
              />
            </div>

            <div className="fade-up flex flex-col gap-1.5" style={{ animationDelay: "320ms" }}>
              <span className="label">密码</span>
              <input
                className="input"
                type="password"
                placeholder="平台登录密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="fade-up text-xs text-bad bg-bad/10 border border-bad/20 rounded-md px-3 py-2">{error}</div>
            )}

            <button className="fade-up btn-brand w-full !py-2.5 mt-1" style={{ animationDelay: "380ms" }} disabled={busy}>
              {busy ? <Spinner className="!w-4 !h-4" /> : "登 录"}
            </button>
          </div>

          <div className="login-hint flex items-center justify-center gap-1.5 mt-6 text-[11px] text-faint">
            <ShieldCheck size={12} />
            与网页端同账号 · 权限规则完全一致
          </div>
        </form>
      </div>

      <div className="login-hint absolute bottom-4 text-[11px] text-faint mono pointer-events-none">
        山东大川重工机床股份有限公司 · 内部数据请勿外传
      </div>
    </div>
  );
}
