import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Download, File as FileIcon, FileSpreadsheet, FileText, Film, Image as ImageIcon, Music, ZoomIn, ZoomOut } from "lucide-react";
import { Sheet, Spinner, notify } from "./ui";
import { getServerUrl } from "../lib/api";
import {
  attachmentKind,
  attachmentKindLabel,
  attachmentName,
  formatBytes,
  isPreviewable,
  loadAttachmentFile,
  loadAttachmentUrl,
  saveAttachmentFile,
  type AttachmentKind,
  type AttachmentRef,
  type LoadedAttachment,
} from "../lib/attachments";

/* ---------- 全局预览宿主：任何位置调用 openAttachmentPreview() 即可弹出 ---------- */

let opened: AttachmentRef | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot() {
  return opened;
}

/** 在应用内打开附件预览（图片/PDF/视频/音频/文本）；Office 等无内置渲染器的格式提供下载 */
export function openAttachmentPreview(file: AttachmentRef | null) {
  opened = file;
  listeners.forEach((listener) => listener());
}

/** 挂载一次（App 根部）：承载全应用共用的附件预览面板 */
export function AttachmentPreviewHost() {
  const file = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!file) return null;
  return <AttachmentViewer file={file} onClose={() => openAttachmentPreview(null)} />;
}

function KindIcon({ kind, size = 14 }: { kind: AttachmentKind; size?: number }) {
  if (kind === "image") return <ImageIcon size={size} />;
  if (kind === "pdf") return <FileText size={size} />;
  if (kind === "video") return <Film size={size} />;
  if (kind === "audio") return <Music size={size} />;
  if (kind === "office") return <FileSpreadsheet size={size} />;
  return <FileIcon size={size} />;
}

function AttachmentViewer({ file, onClose }: { file: AttachmentRef; onClose: () => void }) {
  const kind = attachmentKind(file.path, file.mime);
  const name = file.name || attachmentName(file.path);
  const [state, setState] = useState<{ loading: boolean; error: string; data: LoadedAttachment | null }>({
    loading: true,
    error: "",
    data: null,
  });
  const [zoom, setZoom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const urlRef = useRef("");

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: "", data: null });
    setZoom(false);
    setSaveMsg("");
    loadAttachmentFile({ path: file.path, mime: file.mime }, getServerUrl())
      .then((data) => {
        if (!alive) {
          if (data.url) URL.revokeObjectURL(data.url);
          return;
        }
        urlRef.current = data.url;
        setState({ loading: false, error: "", data });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error: (error as Error).message, data: null });
      });
    return () => {
      alive = false;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = "";
      }
    };
  }, [file.path, file.mime]);

  const download = async () => {
    setSaving(true);
    setSaveMsg("");
    const result = await saveAttachmentFile({ path: file.path, name }, getServerUrl());
    setSaving(false);
    if (result.saved) {
      notify("附件已保存");
      setSaveMsg(result.filePath ? `已保存到 ${result.filePath}` : "附件已保存");
    } else if (result.error) {
      setSaveMsg(result.error);
    }
  };

  const data = state.data;
  const subtitle = [attachmentKindLabel(kind), data ? formatBytes(data.size) : null].filter(Boolean).join(" · ");

  return (
    <Sheet
      title={file.label || name}
      subtitle={subtitle}
      onClose={onClose}
      size="wide"
      bodyClassName="!p-0 flex flex-col"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-xs text-faint">
          <KindIcon kind={kind} />
          <span className="truncate" title={file.path}>
            {name}
          </span>
          {data && <span className="mono shrink-0">{formatBytes(data.size)}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {kind === "image" && data && (
            <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setZoom((value) => !value)}>
              {zoom ? <ZoomOut size={13} /> : <ZoomIn size={13} />}
              {zoom ? "适应窗口" : "原始尺寸"}
            </button>
          )}
          <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={saving} onClick={() => void download()}>
            {saving ? <Spinner className="!h-3.5 !w-3.5" /> : <Download size={13} />}下载
          </button>
        </div>
      </div>
      {saveMsg && <p className="border-b border-line px-5 py-1.5 text-xs text-faint">{saveMsg}</p>}

      <div className="flex min-h-0 flex-1 flex-col">
        {state.loading && (
          <div className="flex flex-1 items-center justify-center gap-2 text-xs text-faint">
            <Spinner /> 正在加载附件…
          </div>
        )}
        {!state.loading && state.error && (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-bad">{state.error}</div>
        )}
        {data && kind === "image" && (
          <div className={`flex flex-1 items-center justify-center bg-black/25 ${zoom ? "overflow-auto items-start justify-start" : "overflow-hidden"}`}>
            <img
              src={data.url}
              alt={name}
              className={zoom ? "max-w-none" : "max-h-full max-w-full object-contain"}
              onClick={() => setZoom((value) => !value)}
            />
          </div>
        )}
        {data && kind === "pdf" && <iframe className="h-full w-full flex-1 border-0 bg-white" src={data.url} title={name} />}
        {data && kind === "video" && (
          <div className="flex flex-1 items-center justify-center bg-black">
            <video className="max-h-full w-full" src={data.url} controls />
          </div>
        )}
        {data && kind === "audio" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <Music size={30} className="text-faint" />
            <audio className="w-full max-w-md" src={data.url} controls />
          </div>
        )}
        {data && kind === "text" && (
          <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all px-5 py-4 text-xs leading-relaxed text-dim">
            {data.text}
          </pre>
        )}
        {data && !isPreviewable(kind) && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <KindIcon kind={kind} size={34} />
            <p className="text-sm">{attachmentKindLabel(kind)}暂不支持应用内预览</p>
            <p className="text-xs text-faint">点「下载」选择保存位置后，用本机软件打开该文件。</p>
            <button type="button" className="btn-brand !py-1.5 text-xs" disabled={saving} onClick={() => void download()}>
              <Download size={13} />下载到本地
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** 附件链接：点击在应用内预览（替代原来的系统浏览器打开） */
export function AttachmentLink({
  path,
  name,
  mime,
  size,
  label,
  className = "",
  children,
  title,
}: {
  path: string;
  name?: string | null;
  mime?: string | null;
  size?: number | null;
  label?: string | null;
  className?: string;
  children?: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      title={title ?? path}
      onClick={() => openAttachmentPreview({ path, name, mime, size, label })}
    >
      {children ?? attachmentName(path)}
    </button>
  );
}

/** 列表用附件条目：图标 + 文件名（+ 大小），点击在应用内预览 */
export function AttachmentChip({
  path,
  name,
  mime,
  size,
  className = "",
}: {
  path: string;
  name?: string | null;
  mime?: string | null;
  size?: number | null;
  className?: string;
}) {
  const kind = attachmentKind(path, mime);
  const displayName = name || attachmentName(path);
  return (
    <button
      type="button"
      className={`inline-flex max-w-full items-center gap-1.5 text-left text-brandhi hover:underline ${className}`}
      title={`预览 ${displayName}`}
      onClick={() => openAttachmentPreview({ path, name: displayName, mime, size })}
    >
      <KindIcon kind={kind} />
      <span className="truncate">{displayName}</span>
      {size ? <span className="mono shrink-0 text-faint">{formatBytes(size)}</span> : null}
    </button>
  );
}

/** 小图标内联图片（产品图片、头像等）：经会话取回后展示，带全局缓存 */
export function AttachmentImage({ path, alt, className = "" }: { path: string; alt: string; className?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    loadAttachmentUrl(path, getServerUrl())
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) setSrc("");
      });
    return () => {
      alive = false;
    };
  }, [path]);
  if (!src) return null;
  return (
    <button type="button" className="shrink-0" title="点击放大预览" onClick={() => openAttachmentPreview({ path, name: alt })}>
      <img className={className} src={src} alt={alt} />
    </button>
  );
}
