// 附件统一取回与预览判定：所有附件都走主进程会话（fetch:binary）取回后在应用内展示，
// 不再把用户丢给系统浏览器——系统浏览器没有桌面端的会话 Cookie，受保护资源必然 401。
// 本模块保持零运行时依赖（只 import type）：单测直接以 node --experimental-strip-types 加载。
export type AttachmentKind = "image" | "pdf" | "video" | "audio" | "text" | "office" | "other";

/** 受保护上传资源路径映射：平台把 /uploads/* 重写为带鉴权的 /api/uploads/* */
export function toFetchableUploadPath(uploadPath: string): string {
  return uploadPath.startsWith("/uploads/") ? `/api/uploads/${uploadPath.slice("/uploads/".length)}` : uploadPath;
}

/** 判断是否为需要会话鉴权取回的上传资源（/uploads/ 或 /api/uploads/ 前缀） */
export function isProtectedUploadPath(uploadPath: string): boolean {
  return uploadPath.startsWith("/uploads/") || uploadPath.startsWith("/api/uploads/");
}

export interface AttachmentRef {
  /** 平台返回的资源路径：/uploads/x.png、/api/uploads/x.png、/api/upload/... 或完整 http(s) 地址 */
  path: string;
  /** 展示用文件名（缺省取路径末段） */
  name?: string | null;
  mime?: string | null;
  size?: number | null;
  /** 预览面板标题（缺省用文件名） */
  label?: string | null;
}

export interface LoadedAttachment {
  kind: AttachmentKind;
  /** blob: URL，可直接给 img/iframe/video/audio 使用 */
  url: string;
  mime: string;
  size: number;
  /** 文本类附件的内容 */
  text?: string;
}

const EXT_KIND: Record<string, AttachmentKind> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image", gif: "image", bmp: "image",
  heic: "image", heif: "image", svg: "image", avif: "image",
  pdf: "pdf",
  mp4: "video", mov: "video", webm: "video", avi: "video", mkv: "video", m4v: "video",
  mp3: "audio", wav: "audio", m4a: "audio", aac: "audio", ogg: "audio", flac: "audio",
  txt: "text", csv: "text", log: "text", json: "text", md: "text", xml: "text",
  doc: "office", docx: "office", xls: "office", xlsx: "office", ppt: "office", pptx: "office",
};

const MIME_KIND: [RegExp, AttachmentKind][] = [
  [/^image\//, "image"],
  [/^application\/pdf$/, "pdf"],
  [/^video\//, "video"],
  [/^audio\//, "audio"],
  [/^text\//, "text"],
  [/^application\/(msword|vnd\.openxmlformats|vnd\.ms-excel|vnd\.ms-powerpoint)/, "office"],
];

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  svg: "image/svg+xml", pdf: "application/pdf", txt: "text/plain", csv: "text/csv",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function attachmentExt(path: string): string {
  const clean = (path || "").split("?")[0].split("#")[0];
  const match = clean.match(/\.([a-zA-Z0-9]{1,8})$/);
  return match ? match[1].toLowerCase() : "";
}

/** 附件展示名：优先显式命名，其次取路径末段（去掉平台上传目录前缀与随机后缀） */
export function attachmentName(path: string, fallback = "附件"): string {
  const clean = (path || "").split("?")[0].split("#")[0];
  let last = clean.split("/").filter(Boolean).pop() || "";
  try {
    last = decodeURIComponent(last);
  } catch {
    /* 已是明文 */
  }
  return last || fallback;
}

/** 判定预览方式：先看扩展名（平台对 xls/xlsx 返回 octet-stream，不能只信 mime），再看 mime */
export function attachmentKind(path: string, mime?: string | null): AttachmentKind {
  const byExt = EXT_KIND[attachmentExt(path)];
  if (byExt) return byExt;
  const normalized = String(mime || "").toLowerCase().split(";")[0].trim();
  for (const [pattern, kind] of MIME_KIND) if (pattern.test(normalized)) return kind;
  return "other";
}

/** 能否在应用内直接渲染（Office 与未知格式不内置渲染器，提供下载） */
export function isPreviewable(kind: AttachmentKind): boolean {
  return kind === "image" || kind === "pdf" || kind === "video" || kind === "audio" || kind === "text";
}

export function attachmentKindLabel(kind: AttachmentKind): string {
  return { image: "图片", pdf: "PDF 文档", video: "视频", audio: "音频", text: "文本", office: "Office 文档", other: "文件" }[kind];
}

export function formatBytes(size?: number | null): string {
  const value = Number(size || 0);
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

/** 把任意资源地址折算成「服务器 + 鉴权路径」，供 fetch:binary / attachment:save 使用；相对路径必须给服务器地址 */
export function resolveAttachmentRequest(path: string, baseUrl: string): { baseUrl: string; path: string } | null {
  const value = String(path || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return { baseUrl: url.origin, path: url.pathname + url.search };
    } catch {
      return null;
    }
  }
  if (!value.startsWith("/") || !baseUrl) return null;
  return { baseUrl, path: toFetchableUploadPath(value) };
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function dataUrlPayload(dataUrl: string): { base64: string; mime: string } {
  const match = dataUrl.match(/^data:([^;,]*)(;charset=[^;,]*)?;base64,(.*)$/s);
  if (!match) throw new Error("附件数据格式异常");
  return { mime: match[1] || "application/octet-stream", base64: match[3] || "" };
}

/** 取回附件内容。图片/PDF/视频/音频转 blob:（data: URL 超过 2MB 会被 Chromium 拒绝），文本直接解码 */
export async function loadAttachmentFile(ref: AttachmentRef, baseUrl: string): Promise<LoadedAttachment> {
  const target = resolveAttachmentRequest(ref.path, baseUrl);
  if (!target) throw new Error("附件地址无效");
  const res = await window.dachuan.fetchBinary(target);
  const dataUrl: string | undefined = res.json?.dataUrl;
  if (!res.ok || !dataUrl) throw new Error(res.error || "附件加载失败");
  const payload = dataUrlPayload(dataUrl);
  const reportedMime: string = res.json?.mime || payload.mime;
  const kind = attachmentKind(ref.path, ref.mime || reportedMime);
  const ext = attachmentExt(ref.path);
  const mime = EXT_MIME[ext] || reportedMime || "application/octet-stream";
  const bytes = base64ToBytes(payload.base64);
  const size = Number(res.json?.size) || bytes.byteLength;
  if (kind === "text") {
    return { kind, url: "", mime, size, text: new TextDecoder("utf-8").decode(bytes) };
  }
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  return { kind, url: blobUrl, mime, size };
}

/** 下载附件：主进程取回后弹原生保存框（仍在应用内完成，不跳浏览器） */
export async function saveAttachmentFile(ref: AttachmentRef, baseUrl: string): Promise<{ saved: boolean; filePath?: string; error?: string }> {
  const target = resolveAttachmentRequest(ref.path, baseUrl);
  if (!target) return { saved: false, error: "附件地址无效" };
  return window.dachuan.saveAttachment({ ...target, name: ref.name || attachmentName(ref.path) });
}

/* ---------- 小图标内联图片缓存（产品图片、头像等）：同一路径只取一次 ---------- */

const urlCache = new Map<string, string>();

export function cachedAttachmentUrl(path: string): string | undefined {
  return urlCache.get(path);
}

export async function loadAttachmentUrl(path: string, baseUrl: string): Promise<string> {
  const cached = urlCache.get(path);
  if (cached) return cached;
  const loaded = await loadAttachmentFile({ path }, baseUrl);
  if (urlCache.size > 64) {
    const oldest = urlCache.keys().next().value;
    if (oldest) {
      const stale = urlCache.get(oldest);
      if (stale) URL.revokeObjectURL(stale);
      urlCache.delete(oldest);
    }
  }
  urlCache.set(path, loaded.url);
  return loaded.url;
}
