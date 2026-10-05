import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, Trash2 } from "lucide-react";
import { api, getCachedUser, uploadFile } from "../lib/api";
import { Spinner } from "./ui";
import { AttachmentChip } from "./attachment-preview";
import type { ErpAttachmentRow } from "../types";

const ACCEPTED_FILES = "image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx";
const ATTACHMENT_HELP_TEXT = "可上传到货、送货单、数量异常凭证、零件损坏等照片或电子版凭据。";

/** 出入库单据附件：非必填，上传/删除走 /api/erp/attachments（STOCK_IN/OUT 删除仅超管，403 由平台兜底） */
export function ErpDocumentAttachments({ entityType, entityId }: { entityType: "STOCK_IN" | "STOCK_OUT"; entityId: string }) {
  const [items, setItems] = useState<ErpAttachmentRow[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    try {
      const result = await api<ErpAttachmentRow[]>("/api/erp/attachments", {
        query: { entityType, entityId },
      });
      if (requestId !== requestRef.current) return;
      setItems(Array.isArray(result) ? result : []);
      setError("");
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      setError((loadError as Error).message);
      setItems([]);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    void load();
    return () => { requestRef.current += 1; };
  }, [load]);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setError("");
    const failed: string[] = [];
    for (const file of files) {
      try {
        await uploadFile("/api/erp/attachments", file, { entityType, entityId });
      } catch {
        failed.push(file.name);
      }
    }
    if (failed.length) setError(`以下附件上传失败：${failed.join("、")}`);
    await load();
    setUploading(false);
  };

  const remove = async (attachment: ErpAttachmentRow) => {
    setDeletingId(attachment.id);
    setError("");
    try {
      await api(`/api/erp/attachments/${encodeURIComponent(attachment.id)}`, { method: "DELETE" });
      await load();
    } catch (removeError) {
      setError((removeError as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return <section className="rounded-xl border border-line px-3.5 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium">附件（非必填）</span>
      <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={uploading} onClick={() => inputRef.current?.click()}><Paperclip size={13} />{uploading ? "上传中" : "附件"}</button>
      <input ref={inputRef} className="hidden" type="file" multiple accept={ACCEPTED_FILES} onChange={(event) => { void upload(Array.from(event.target.files || [])); event.target.value = ""; }} />
    </div>
    <p className="mt-2 text-xs text-faint">{ATTACHMENT_HELP_TEXT}</p>
    {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    <div className="mt-2 space-y-2">
      {items.length === 0 && <p className="text-xs text-faint">暂无附件</p>}
      {items.map((attachment) => (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-panel2 px-2.5 py-2 text-xs" key={attachment.id}>
          <AttachmentChip
            path={attachment.fileUrl}
            name={attachment.fileName}
            mime={attachment.mimeType}
            size={attachment.fileSize}
          />
          <button type="button" title="删除附件（会保留审计记录）" className="inline-flex shrink-0 items-center gap-1 text-bad" disabled={deletingId === attachment.id} onClick={() => void remove(attachment)}>{deletingId === attachment.id ? <Spinner className="!h-3 !w-3" /> : <Trash2 size={12} />}删除</button>
        </div>
      ))}
    </div>
  </section>;
}

/** 新增单据时暂存的待上传附件列表 */
export function PendingErpAttachments({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return <div className="rounded-xl border border-line px-3.5 py-3">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => inputRef.current?.click()}><Paperclip size={13} />附件</button>
      <span className="text-xs text-faint">非必填，已选择 {files.length} 个文件</span>
      <input ref={inputRef} className="hidden" type="file" multiple accept={ACCEPTED_FILES} onChange={(event) => { const next = Array.from(event.target.files || []); if (next.length) onChange([...files, ...next]); event.target.value = ""; }} />
    </div>
    <p className="mt-2 text-xs text-faint">{ATTACHMENT_HELP_TEXT}</p>
    {files.length > 0 && (
      <div className="mt-2 space-y-1">
        {files.map((file, index) => (
          <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between rounded bg-panel2 px-2 py-1 text-xs">
            <span className="truncate">{file.name}</span>
            <button type="button" title="移除附件" className="shrink-0 text-faint hover:text-bad" onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}>移除</button>
          </div>
        ))}
      </div>
    )}
  </div>;
}

/** 单据创建成功后批量上传暂存附件，返回失败的文件名列表 */
export async function uploadErpAttachmentFiles(entityType: "STOCK_IN" | "STOCK_OUT", entityId: string, files: File[]): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    try {
      await uploadFile("/api/erp/attachments", file, { entityType, entityId });
    } catch {
      failed.push(file.name);
    }
  }
  return failed;
}

export function AfterSalesAttachments({ orderId, onCountChange }: { orderId: string; onCountChange: (count: number) => void }) {
  const [items, setItems] = useState<ErpAttachmentRow[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const user = getCachedUser();

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    try {
      const result = await api<ErpAttachmentRow[]>("/api/erp/attachments", {
        query: { entityType: "AFTER_SALES_ORDER", entityId: orderId },
      });
      if (requestId !== requestRef.current) return;
      const next = Array.isArray(result) ? result : [];
      setItems(next);
      onCountChange(next.length);
      setError("");
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      setError((loadError as Error).message);
      setItems([]);
      onCountChange(0);
    }
  }, [onCountChange, orderId]);

  useEffect(() => {
    void load();
    return () => { requestRef.current += 1; };
  }, [load]);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setError("");
    const failed: string[] = [];
    for (const file of files) {
      try {
        await uploadFile("/api/erp/attachments", file, { entityType: "AFTER_SALES_ORDER", entityId: orderId });
      } catch {
        failed.push(file.name);
      }
    }
    if (failed.length) setError(`以下附件上传失败：${failed.join("、")}`);
    await load();
    setUploading(false);
  };

  const remove = async (attachment: ErpAttachmentRow) => {
    if (!window.confirm(`确认删除附件“${attachment.fileName}”吗？删除操作会保留审计记录。`)) return;
    setDeletingId(attachment.id);
    setError("");
    try {
      await api("/api/erp/attachments", { method: "DELETE", query: { id: attachment.id } });
      await load();
    } catch (removeError) {
      setError((removeError as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return <section className="panel px-3.5 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-medium">客户签字附件</h3><p className="mt-1 text-xs text-faint">已完成工单上传客户签字照片或扫描件后，才能关闭。</p></div>
      <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={uploading} onClick={() => inputRef.current?.click()}><Paperclip size={13} />{uploading ? "上传中" : "上传附件"}</button>
      <input ref={inputRef} className="hidden" type="file" multiple accept={ACCEPTED_FILES} onChange={(event) => { void upload(Array.from(event.target.files || [])); event.target.value = ""; }} />
    </div>
    {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    <div className="mt-3 space-y-2">
      {items.length === 0 && <p className="text-xs text-faint">暂无附件</p>}
      {items.map((attachment) => {
        const canDelete = user?.role === "SUPER_ADMIN" || attachment.uploadedById === user?.id;
        return <div className="flex items-center justify-between gap-2 rounded-lg bg-panel2 px-2.5 py-2 text-xs" key={attachment.id}>
          <AttachmentChip
            path={attachment.fileUrl}
            name={attachment.fileName}
            mime={attachment.mimeType}
            size={attachment.fileSize}
          />
          {canDelete && <button type="button" className="inline-flex shrink-0 items-center gap-1 text-bad" disabled={deletingId === attachment.id} onClick={() => void remove(attachment)}>{deletingId === attachment.id ? <Spinner className="!h-3 !w-3" /> : <Trash2 size={12} />}删除</button>}
        </div>;
      })}
    </div>
  </section>;
}
