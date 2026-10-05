import { useRef, useState } from "react";
import { AlertTriangle, Download, RefreshCw, RotateCcw, X } from "lucide-react";
import { useUpdater } from "../lib/updater-client";
import { releaseNotesOf } from "../lib/changelog";

function formatBytes(n?: number): string {
  if (!n && n !== 0) return "";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

/** 应用内更新横幅：检测到新版本 → 端内下载（增量）→ 端内重启安装，全程不离开应用 */
export default function UpdateBanner() {
  const { event, check, download, install } = useUpdater();
  // "稍后"只对当前版本号/阶段生效：版本变化或状态推进后重新弹出
  const [dismissedAt, setDismissedAt] = useState("");
  // 错误可能发生在检查或下载阶段：重试按钮按出错前的动作重发
  const lastAction = useRef<"check" | "download">("check");

  if (event.type === "idle" || event.type === "not-available" || event.type === "checking") return null;

  if (event.type === "error") {
    return (
      <BannerCard onClose={() => setDismissedAt(`err:${event.message}`)}>
        <BannerTitle icon={<AlertTriangle size={16} className="text-bad" />}>更新失败</BannerTitle>
        <p className="mt-1 line-clamp-3 text-xs text-dim">{event.message}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => {
              if (lastAction.current === "download") void download();
              else void check();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            <RefreshCw size={13} />
            重试
          </button>
        </div>
      </BannerCard>
    );
  }

  if (event.type === "available") {
    if (dismissedAt === `v${event.version}`) return null;
    const notes = releaseNotesOf(event.version).slice(0, 2);
    return (
      <BannerCard onClose={() => setDismissedAt(`v${event.version}`)}>
        <BannerTitle icon={<Download size={16} className="text-brand" />}>发现新版本 v{event.version}</BannerTitle>
        {notes.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {notes.map((note, i) => (
              <li key={i} className="line-clamp-2 text-xs text-dim">
                · {note}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => {
              lastAction.current = "download";
              void download();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            <Download size={13} />
            立即更新
          </button>
          <button
            onClick={() => setDismissedAt(`v${event.version}`)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-dim transition-colors hover:text-ink"
          >
            稍后
          </button>
        </div>
      </BannerCard>
    );
  }

  if (event.type === "downloading") {
    const percent = Math.min(100, Math.max(0, Math.round(event.percent)));
    return (
      <BannerCard onClose={() => setDismissedAt("downloading")}>
        <BannerTitle icon={<Download size={16} className="text-brand" />}>正在下载更新… {percent}%</BannerTitle>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel2">
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-faint">
          {formatBytes(event.transferred)} / {formatBytes(event.total)}
          {event.bytesPerSecond ? ` · ${formatBytes(event.bytesPerSecond)}/s` : ""}
        </p>
      </BannerCard>
    );
  }

  // downloaded：重启即装；即使用户不点，退出应用时也会自动安装（autoInstallOnAppQuit）
  return (
    <BannerCard onClose={() => setDismissedAt("downloaded")}>
      <BannerTitle icon={<RotateCcw size={16} className="text-brand" />}>更新已就绪 v{event.version}</BannerTitle>
      <p className="mt-1 text-xs text-dim">重启应用即完成更新；不重启也会在退出时自动更新，下次打开就是新版本。</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => void install()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <RotateCcw size={13} />
          立即重启更新
        </button>
      </div>
    </BannerCard>
  );
}

function BannerCard({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute bottom-4 right-4 z-50 w-80 rounded-2xl border border-line bg-panel p-4 shadow-xl">
      <button
        aria-label="关闭"
        className="absolute right-2.5 top-2.5 rounded-md p-1 text-faint transition-colors hover:text-ink"
        onClick={onClose}
        type="button"
      >
        <X size={14} />
      </button>
      {children}
    </div>
  );
}

function BannerTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 pr-5 text-sm font-semibold text-ink">
      {icon}
      {children}
    </p>
  );
}
