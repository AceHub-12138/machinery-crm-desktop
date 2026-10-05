import { X, Inbox, Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * 弹层统一挂到 body：Sheet/确认框都是 position:fixed 覆盖层，
 * 若渲染在已开启 transform 的父弹层内部，fixed 会退化成相对该父层定位并被滚动容器裁剪（弹层里开弹层就看不见了）。
 */
function Overlay({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}

export function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {children}
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`orbit ${className}`} />;
}

export function Empty({ text = "暂无数据" }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14">
      <div className="w-12 h-12 rounded-full border border-line flex items-center justify-center text-faint shadow-[0_0_18px_rgba(238,125,44,0.08)]">
        <Inbox size={20} strokeWidth={1.5} />
      </div>
      <span className="text-sm text-faint">{text}</span>
    </div>
  );
}

export function ErrorTip({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14">
      <span className="text-sm text-bad">{message}</span>
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

/** iOS 底部弹出的 Sheet（带抓取条、毛玻璃、Esc/点击遮罩关闭） */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  size = "default",
  bodyClassName = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** wide/full 用于附件预览等需要大面积渲染的场景（默认 680px 宽） */
  size?: "default" | "wide" | "full";
  bodyClassName?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Overlay>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet${size === "default" ? "" : ` sheet-${size}`}`}>
        <div className="grabber" onClick={onClose} title="关闭" />
        <div
          className="flex items-start justify-between gap-3 px-6 pt-2.5 pb-3 border-b"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div className="min-w-0">
            <div className="text-base font-semibold truncate">{title}</div>
            {subtitle && <div className="text-xs text-faint mt-0.5 truncate">{subtitle}</div>}
          </div>
          <button className="btn-ghost !rounded-full !px-2 !py-2" onClick={onClose} title="关闭">
            <X size={14} />
          </button>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto px-6 py-4 ${bodyClassName}`}>{children}</div>
      </div>
    </Overlay>
  );
}

/** 应用内确认框（替代 window.confirm：与主题一致，且不会被弹窗策略拦截） */
export function ConfirmDialog({
  title,
  message,
  confirmText = "确定",
  cancelText = "取消",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  title: ReactNode;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <Overlay>
      <div className="sheet-backdrop" style={{ zIndex: 55 }} onClick={() => !busy && onCancel()} />
      <div className="confirm-dialog" role="dialog" aria-modal="true">
        <div className="text-sm font-semibold">{title}</div>
        {message && <div className="mt-2 text-xs leading-relaxed text-dim">{message}</div>}
        {children && <div className="mt-3">{children}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={danger ? "btn-ghost !text-bad" : "btn-brand"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <Spinner className="!h-4 !w-4" /> : confirmText}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/** iOS 分段控件 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === value ? "seg-active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** iOS 拨动开关 */
export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="knob" />
    </button>
  );
}

/** 轻提示：notify("已保存") */
export function notify(message: string) {
  window.dispatchEvent(new CustomEvent("dc:toast", { detail: { message, type: "success" } }));
}

/** Toast 提示：showToast("操作成功", "success") 或 showToast("操作失败", "error") */
export function showToast(message: string, type: "success" | "error" | "info" = "success") {
  window.dispatchEvent(new CustomEvent("dc:toast", { detail: { message, type } }));
}

export function ToastHost() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const id = ++n;
      const detail = (e as CustomEvent<{ message: string; type?: string } | string>).detail;
      const msg = typeof detail === "string" ? detail : detail.message;
      const type = typeof detail === "string" ? "success" : (detail.type || "success");
      setToasts((t) => [...t, { id, msg, type }]);
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400);
    };
    window.addEventListener("dc:toast", on);
    return () => window.removeEventListener("dc:toast", on);
  }, []);
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast flex items-center gap-1.5 ${t.type === "error" ? "!bg-bad/90 !text-white" : ""}`}>
          <Check size={13} className={t.type === "error" ? "text-white" : "text-brand"} />
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <span className="text-sm text-ink break-all">{children}</span>
    </div>
  );
}

export function Dash() {
  return <span className="text-faint">—</span>;
}

/**
 * 页头：橙色发光竖条 + 标题 + 右侧操作区。
 * 根节点与右侧工具栏都允许 flex-wrap：窗口变窄时工具栏整体掉到下一行，
 * 而不是把标题/副标题挤压成单字竖排（合同管理页头在 ~1200px 宽度踩过这个坑）。
 */
export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
      <div className="min-w-0 max-w-full">
        <h1 className="text-xl font-semibold whitespace-nowrap flex items-center gap-2.5">
          <span className="inline-block w-1 h-5 rounded-full bg-gradient-to-b from-brandhi to-brand shadow-[0_0_10px_rgba(238,125,44,0.6)]" />
          {title}
        </h1>
        {sub && <p className="text-xs text-faint mt-1 pl-3.5">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export interface SearchSelectOption {
  value: string;
  label: string;
  sub?: string;
}

/** 可搜索下拉：选项多时输入关键词快速过滤；onQuery 提供时改为服务端搜索模式 */
export function SearchSelect({
  value,
  options,
  onChange,
  onQuery,
  loading = false,
  placeholder = "请选择",
  searchPlaceholder = "输入关键词筛选…",
  emptyText,
  disabled = false,
  className = "",
}: {
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  onQuery?: (keyword: string) => void;
  loading?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  /** 无选项时的说明文案，用于"先选省份才能选市"这类有前置条件的下拉 */
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [anchor, setAnchor] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    if (onQuery) return options;
    const kw = q.trim().toLowerCase();
    if (!kw) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(kw) || (o.sub || "").toLowerCase().includes(kw),
    );
  }, [options, q, onQuery]);

  /**
   * 面板用 fixed 定位锚在触发按钮上：Sheet 的内容区是 overflow-y-auto，
   * 若用 absolute 会被容器裁掉，靠下的字段（如"归属业务员"）根本选不中。
   * 面板必须 portal 到 body：祖先里的 .sheet/.panel 带 transform 或 backdrop-filter，
   * 会成为 fixed 的包含块，视口坐标被当作父层坐标用，面板整体平移到右下角。
   */
  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const flipUp = below < 260 && r.top > below;
    setAnchor(
      flipUp
        ? { left: r.left, bottom: window.innerHeight - r.top + 6, width: r.width }
        : { left: r.left, top: r.bottom + 6, width: r.width },
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // 面板已 portal 到 body，不在 boxRef 子树里，必须单独判断，否则点选项会先被判成"点外部"
      if (boxRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    reposition();
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    // capture=true：Sheet 内部滚动容器不冒泡，必须在捕获阶段才能收到
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          setOpen(true);
          setQ("");
          onQuery?.("");
        }}
        className={`input flex items-center justify-between gap-2 text-left ${disabled ? "opacity-60" : ""}`}
      >
        <span className={`truncate ${current ? "" : "text-faint"}`}>{current?.label || placeholder}</span>
        <ChevronDown size={14} className="shrink-0 text-faint" />
      </button>
      {open && anchor && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[60] overflow-hidden !rounded-xl border border-line bg-panel shadow-lg backdrop-blur-xl"
          style={{ left: anchor.left, top: anchor.top, bottom: anchor.bottom, width: anchor.width }}
        >
          <div className="border-b border-line/60 p-2 bg-panel2/80">
            <input
              autoFocus
              className="input !py-1.5"
              placeholder={searchPlaceholder}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                onQuery?.(e.target.value);
              }}
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1 bg-panel">
            {loading ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-faint">{emptyText || "无匹配项"}</div>
            ) : (
              filtered.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`block w-full truncate px-3 py-2 text-left text-sm transition-colors hover:bg-brand/10 ${
                    o.value === value ? "text-brandhi bg-brand/5" : ""
                  }`}
                  title={o.sub ? `${o.label}（${o.sub}）` : o.label}
                >
                  {o.label}
                  {o.sub && <span className="ml-1.5 text-xs text-faint">{o.sub}</span>}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
