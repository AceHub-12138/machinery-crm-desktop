import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Send, Square, Zap, Wrench, Paperclip, FileText, Image as ImageIcon, X, ChevronLeft, ChevronRight, Trash2, Brain, ChevronDown, Check, Copy, RefreshCcw, ThumbsUp, ThumbsDown } from "lucide-react";
import { api, getServerUrl } from "../lib/api";
import { relativeTime } from "../lib/format";
import { Spinner, showToast } from "../components/ui";
import { openAttachmentPreview } from "../components/attachment-preview";
import { MdContent } from "../components/md-content";
import { PDF_PAGE_RENDER_LIMIT, renderPdfPagesToImages } from "../lib/pdf-pages";
import logoBadge from "../assets/logo-badge.png";
import type { ConversationRow, ChatMessageRow } from "../types";
import type { ChatEvent, ChatAttachment } from "../lib/ipc";

const TIERS = [
  { value: "fast", label: "快速" },
  { value: "standard", label: "标准" },
  { value: "deep", label: "深度" },
] as const;

type Tier = (typeof TIERS)[number]["value"];

/** 与平台 /api/upload/xiaochuan 白名单一致：图片 / PDF / CAD，单文件 20MB、每条消息 5 个 */
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const UPLOAD_PATH = "/api/upload/xiaochuan";

function kindFromName(name: string): ChatAttachment["kind"] | null {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  if (ext === ".dxf" || ext === ".dwg") return "cad";
  return null;
}

function fmtSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  if (size >= 1024) return `${Math.round(size / 1024)}KB`;
  return `${size}B`;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

/** PDF 派生页图片是 Blob，同样转 base64 交主进程上传 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(blob);
  });
}

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 平台落库后的真实 messageId；本地临时消息（如 HTTP 未建立流）为空，不参与点赞落库 */
  messageId?: string;
  streaming?: boolean;
  error?: boolean;
  tools?: { tool: string; ok: boolean; durationMs: number }[];
  durationMs?: number;
  attachments?: Pick<ChatAttachment, "name" | "size" | "kind" | "url">[];
  /** 混合推理模型的思考内容（仅当轮流式展示，不落库；刷新后消失，与平台一致） */
  reasoning?: string;
  /** 思考已结束（正文开始输出/工具开始调用/回答完成） */
  reasoningFinished?: boolean;
  /** 历史回放的平台 toolSummary 字段名对齐 */
  toolSummary?: { tool: string; ok: boolean; durationMs: number }[];
  /** 段 5：小川回复的点赞/点踩状态（"up" | "down" | null） */
  feedback?: "up" | "down" | null;
}

/** 平台 /api/agent/conversations/[id] 的 assistant 行多了 feedback，本地补声明 */
type HistoryMessage = ChatMessageRow & { feedback?: "up" | "down" | null };

const SUGGESTIONS = [
  "今天有哪些客户需要跟进？",
  "本月合同签约和回款情况怎么样？",
  "有哪些合同逾期未发货？",
];

function newId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `r-${Date.now()}-${Math.random()}`;
}

function ActionButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-md p-1 text-faint transition-colors hover:bg-panel2 hover:text-dim ${
        active ? "bg-brand/10 !text-brand" : ""
      }`}
    >
      {children}
    </button>
  );
}

/**
 * 小川回复下方的操作条：复制 / 重新回答 / 有帮助 / 没帮助。
 * 与平台 components/xiaochuan/message-actions.tsx 对齐：点赞/点踩落库，重新回答仅最后一条可见；
 * 消息尚无平台 id 时优雅跳过投票按钮（仍保留复制/重新回答）。
 */
function MessageActions({
  content,
  messageId,
  feedback,
  canRetry,
  onRetry,
  onFeedback,
}: {
  content: string;
  messageId?: string;
  feedback: "up" | "down" | null;
  canRetry: boolean;
  onRetry: () => void;
  onFeedback: (kind: "up" | "down") => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      showToast("复制失败，请手动选择文本", "error");
    }
  };

  return (
    <div className="mt-1 flex items-center gap-0.5">
      <ActionButton label={copied ? "已复制" : "复制"} onClick={() => void copyContent()}>
        {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
      </ActionButton>
      {canRetry && (
        <ActionButton label="重新回答" onClick={onRetry}>
          <RefreshCcw size={13} />
        </ActionButton>
      )}
      {messageId && (
        <>
          <ActionButton label="有帮助" active={feedback === "up"} onClick={() => onFeedback("up")}>
            <ThumbsUp size={13} />
          </ActionButton>
          <ActionButton label="没帮助" active={feedback === "down"} onClick={() => onFeedback("down")}>
            <ThumbsDown size={13} />
          </ActionButton>
        </>
      )}
    </div>
  );
}

/** 附件小卡片：文件名 + 大小 + 类型图标；已上传（有 url）的附件点击即在应用内预览，待发送时可移除 */
function AttachmentChip({ att, onRemove }: { att: { name: string; size: number; kind: string; url?: string }; onRemove?: () => void }) {
  const icon = att.kind === "image" ? (
    <ImageIcon size={11} className="shrink-0 text-brand" />
  ) : (
    <FileText size={11} className="shrink-0 text-brand" />
  );
  return (
    <span className="inline-flex max-w-[190px] items-center gap-1.5 rounded-lg border border-line bg-panel2/80 px-2 py-1 text-[11px] text-dim">
      {att.url ? (
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1.5 hover:text-brandhi"
          title="在应用内预览"
          onClick={() => openAttachmentPreview({ path: att.url!, name: att.name })}
        >
          {icon}
          <span className="truncate">{att.name}</span>
          <span className="shrink-0 text-faint">{fmtSize(att.size)}</span>
        </button>
      ) : (
        <>
          {icon}
          <span className="truncate">{att.name}</span>
          <span className="shrink-0 text-faint">{fmtSize(att.size)}</span>
        </>
      )}
      {onRemove && (
        <button className="shrink-0 text-faint transition-colors hover:text-bad" onClick={onRemove} title="移除">
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export default function ChatView() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [tier, setTier] = useState<Tier>("standard");
  const [streaming, setStreaming] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const reqIdRef = useRef<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamingMsgRef = useRef<string | null>(null);
  /**
   * 平台错误路径会先发 {type:"done", error:true, messageId} 再紧跟 {type:"error", message}。
   * done 会清空 reqIdRef，若仍按 reqId 过滤就会把紧随其后的错误吞掉；这里记住刚失败的
   * 请求与消息 id，让尾随的 error 事件仍能落到同一条失败消息上。
   */
  const pendingErrorRef = useRef<{ reqId: string; msgId: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  convIdRef.current = convId;

  const loadConversations = useCallback(async () => {
    try {
      const res = await api<{ conversations: ConversationRow[] }>("/api/agent/conversations");
      setConversations(res.conversations || []);
    } catch {
      /* 列表失败不打断对话 */
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // 全局订阅小川流式事件
  useEffect(() => {
    const off = window.dachuan.onChatEvent(({ reqId, data }) => {
      const ev = data as ChatEvent;
      // 尾随错误：平台在 {done, error:true} 之后紧跟一条 error，done 已清空 reqIdRef，
      // 这里放行这条 error，让它把失败文案写入同一条 assistant 消息。
      const tailError =
        ev.type === "error" && pendingErrorRef.current?.reqId === reqId ? pendingErrorRef.current : null;
      if (reqId !== reqIdRef.current && !tailError) return;
      const sid = tailError ? tailError.msgId : streamingMsgRef.current;
      if (!sid) return;
      if (ev.type === "meta") {
        setConvId(ev.conversationId);
        convIdRef.current = ev.conversationId;
      } else if (ev.type === "reasoning") {
        // 思考内容增量：先于正文到达，直播进思考区（不落库，历史回放没有）
        setMessages((prev) => prev.map((m) => (m.id === sid ? { ...m, reasoning: (m.reasoning || "") + ev.text } : m)));
      } else if (ev.type === "delta") {
        // 正文增量保留原始 Markdown，由 MdContent 渲染排版（与平台一致）
        setMessages((prev) => prev.map((m) => (m.id === sid ? { ...m, content: m.content + ev.text, reasoningFinished: true } : m)));
      } else if (ev.type === "tool") {
        setMessages((prev) =>
          prev.map((m) => (m.id === sid ? { ...m, reasoningFinished: true, tools: [...(m.tools || []), ev] } : m)),
        );
      } else if (ev.type === "done") {
        // 落库后的平台 id 记到 messageId（本地 id 保持不变，作 React key）；error:true 时保留“尾随 error”通道
        const failed = !!ev.error;
        const targetId = ev.messageId || sid;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === sid
              ? { ...m, messageId: targetId, streaming: false, error: failed, durationMs: ev.durationMs, reasoningFinished: true }
              : m,
          ),
        );
        streamingMsgRef.current = null;
        reqIdRef.current = null;
        pendingErrorRef.current = failed ? { reqId, msgId: sid } : null;
        setStreaming(false);
        loadConversations();
      } else if (ev.type === "error") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === sid ? { ...m, streaming: false, error: !m.content, content: m.content || ev.message } : m,
          ),
        );
        pendingErrorRef.current = null;
        streamingMsgRef.current = null;
        reqIdRef.current = null;
        setStreaming(false);
      } else if (ev.type === "__end__" || ev.type === "__aborted__") {
        setMessages((prev) => prev.map((m) => (m.id === sid ? { ...m, streaming: false } : m)));
        pendingErrorRef.current = null;
        streamingMsgRef.current = null;
        reqIdRef.current = null;
        setStreaming(false);
      }
    });
    return off;
  }, [loadConversations]);

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const openConversation = async (id: string) => {
    if (streaming) return;
    setConvId(id);
    convIdRef.current = id;
    try {
      const res = await api<{ conversation: unknown; messages: HistoryMessage[] }>(`/api/agent/conversations/${id}`);
      setMessages(
        (res.messages || [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            messageId: m.id,
            role: m.role as "user" | "assistant",
            content: m.content || "",
            error: m.error,
            ...(m.toolSummary?.length ? { tools: m.toolSummary } : {}),
            attachments: (m.attachments ?? []).map((a) => ({
              name: a.name,
              size: a.size,
              url: a.url,
              kind: a.kind === "pdf" || a.kind === "cad" ? a.kind : "image",
            })),
            feedback: m.feedback === "up" || m.feedback === "down" ? m.feedback : null,
          })),
      );
    } catch (err) {
      setMessages([{ id: newId(), role: "assistant", content: `对话加载失败：${(err as Error).message}`, error: true }]);
    }
  };

  const deleteConversation = async (id: string) => {
    if (streaming) return;
    if (!window.confirm("删除后该对话及全部消息不可恢复，确定删除？")) return;
    try {
      await api(`/api/agent/conversations/${id}`, { method: "DELETE" });
      if (convId === id) {
        setConvId(null);
        convIdRef.current = null;
        setMessages([]);
      }
      showToast("对话已删除", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败，请重试", "error");
    } finally {
      loadConversations();
    }
  };

  const startNew = () => {
    if (streaming) return;
    setConvId(null);
    convIdRef.current = null;
    setMessages([]);
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming || uploadingCount > 0) return;
    const sentAttachments = pendingAttachments;
    setInput("");
    setPendingAttachments([]);
    setUploadError("");
    setStreaming(true);
    const userMsg: UiMessage = {
      id: newId(),
      role: "user",
      content,
      attachments: sentAttachments.map((a) => ({ name: a.name, size: a.size, kind: a.kind, url: a.url })),
    };
    const assistantMsg: UiMessage = { id: newId(), role: "assistant", content: "", streaming: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    streamingMsgRef.current = assistantMsg.id;
    const reqId = newId();
    reqIdRef.current = reqId;
    pendingErrorRef.current = null;
    await window.dachuan.chatStart({
      reqId,
      baseUrl: getServerUrl(),
      body: {
        message: content,
        conversationId: convIdRef.current || undefined,
        thinkingTier: tier,
        ...(sentAttachments.length > 0 ? { attachments: sentAttachments } : {}),
      },
    });
  };

  const stop = () => {
    if (reqIdRef.current) window.dachuan.chatAbort(reqIdRef.current);
  };

  /** 重新回答：把该条 assistant 之前最近的一条用户提问重新发一遍（与平台 retry 行为一致） */
  const retryFrom = (index: number) => {
    if (streaming) return;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") {
        void send(messages[i].content);
        return;
      }
    }
  };

  /** 点赞/点踩：POST /api/agent/messages/[id]/feedback，body 必须是 { feedback: "up" | "down" | null } */
  const submitFeedback = async (id: string, kind: "up" | "down") => {
    const current = messages.find((m) => m.messageId === id)?.feedback ?? null;
    const next = current === kind ? null : kind;
    setMessages((prev) => prev.map((m) => (m.messageId === id ? { ...m, feedback: next } : m)));
    try {
      await api(`/api/agent/messages/${id}/feedback`, { method: "POST", body: { feedback: next } });
    } catch (err) {
      // 失败回滚为点击前状态（网络问题不打断使用）
      setMessages((prev) => prev.map((m) => (m.messageId === id ? { ...m, feedback: current } : m)));
      showToast(err instanceof Error ? err.message : "反馈提交失败，请稍后再试", "error");
    }
  };

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  /** PDF 图纸页面 → 派生图片附件（走既有图片视觉通道）；返回剩余附件预算。
   *  失败只提示、不阻断：原 PDF 仍有服务端文字提取兜底，消息照常可发。 */
  const uploadPdfPageImages = async (pdfFile: File, pdfName: string, budget: number): Promise<number> => {
    if (budget <= 0) return budget;
    try {
      const { pages, totalPages } = await renderPdfPagesToImages(pdfFile, {
        maxPages: Math.min(PDF_PAGE_RENDER_LIMIT, budget),
      });
      const baseName = pdfName.replace(/\.pdf$/i, "");
      for (const page of pages) {
        const pageName = `${baseName}-第${page.pageNumber}页.jpg`;
        try {
          const base64 = await blobToBase64(page.blob);
          const res = await window.dachuan.uploadFile({
            baseUrl: getServerUrl(),
            path: UPLOAD_PATH,
            name: pageName,
            mime: "image/jpeg",
            base64,
          });
          const payload = res.json as { url?: string; error?: string } | undefined;
          if (!res.ok || !payload?.url) {
            setUploadError(payload?.error || `图纸第 ${page.pageNumber} 页转图片上传失败`);
            break;
          }
          budget -= 1;
          setPendingAttachments((current) => [
            ...current,
            { url: payload.url!, name: pageName, type: "image/jpeg", kind: "image", size: page.blob.size },
          ]);
        } catch {
          setUploadError(`图纸第 ${page.pageNumber} 页转图片上传失败：网络中断`);
          break;
        }
      }
      if (totalPages > pages.length) {
        setUploadError(`图纸共 ${totalPages} 页，已自动识别前 ${pages.length} 页`);
      }
    } catch {
      setUploadError("PDF 页面转图片失败，这份 PDF 将只按文字方式识别");
    }
    return budget;
  };

  /** 附件先经主进程上传拿 url，进待发区；PDF 额外逐页转派生图走视觉通道。
   *  room 是本批可用的附件名额（总上限减去待发区已占数量）。 */
  const uploadBatch = async (files: File[], room: number) => {
    if (!files.length || room <= 0) return;
    setUploadError("");
    const selected = files.slice(0, room);
    if (files.length > room) setUploadError(`一次最多再带 ${room} 个附件，多出的已忽略`);
    setUploadingCount((current) => current + selected.length);
    // 派生页图片的总预算：本批文件占用的名额之外，剩余名额留给 PDF 图纸页面图
    let derivedBudget = room - selected.length;
    for (const file of selected) {
      try {
        const kind = kindFromName(file.name);
        if (!kind) {
          setUploadError(`「${file.name}」格式暂不支持，仅支持图片（jpg/png/webp/gif/bmp）、PDF、DXF、DWG`);
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setUploadError(`${file.name} 超过 20MB 上限`);
          continue;
        }
        const base64 = await readAsBase64(file);
        const res = await window.dachuan.uploadFile({
          baseUrl: getServerUrl(),
          path: UPLOAD_PATH,
          name: file.name,
          mime: file.type || "application/octet-stream",
          base64,
        });
        const payload = res.json as { url?: string; name?: string; type?: string; kind?: string; size?: number; error?: string } | undefined;
        if (!res.ok || !payload?.url) {
          setUploadError(`${file.name} 上传失败：${payload?.error || res.error || "请稍后再试"}`);
        } else {
          setPendingAttachments((current) => [
            ...current,
            {
              url: payload.url!,
              name: payload.name ?? file.name,
              type: payload.type ?? file.type ?? "application/octet-stream",
              size: payload.size ?? file.size,
              kind: payload.kind === "pdf" || payload.kind === "cad" ? payload.kind : "image",
            },
          ]);
          // 小川一期：PDF 在本地逐页转成图片一并上传，图纸画面才能被视觉模型读到
          if (payload.kind === "pdf") {
            derivedBudget = await uploadPdfPageImages(file, payload.name ?? file.name, derivedBudget);
          }
        }
      } catch {
        setUploadError(`${file.name} 上传失败：网络中断`);
      } finally {
        setUploadingCount((current) => Math.max(0, current - 1));
      }
    }
  };

  const onFilesSelected = async (fileList: FileList | null) => {
    const list = Array.from(fileList ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!list.length) return;
    const room = MAX_ATTACHMENTS - pendingAttachments.length;
    if (room <= 0) {
      setUploadError(`每条消息最多带 ${MAX_ATTACHMENTS} 个附件`);
      return;
    }
    await uploadBatch(list, room);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (streaming || uploadingCount > 0) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // 过滤出支持的文件类型（大小与名额由 uploadBatch 统一校验并提示）
    const validFiles: File[] = [];
    for (const file of files) {
      if (kindFromName(file.name)) validFiles.push(file);
    }

    if (validFiles.length === 0) {
      if (files.length > 0) {
        setUploadError("不支持的文件类型，仅支持图片、PDF、DXF、DWG");
      }
      return;
    }

    const room = MAX_ATTACHMENTS - pendingAttachments.length;
    if (room <= 0) {
      setUploadError(`每条消息最多带 ${MAX_ATTACHMENTS} 个附件`);
      return;
    }
    if (validFiles.length > room) {
      setUploadError(`最多支持 ${MAX_ATTACHMENTS} 个附件`);
      return;
    }

    await uploadBatch(validFiles, room);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 会话列表：跟随主题 Token，与整体色系统一 */}
      {sidebarVisible && (
        <aside className="w-60 shrink-0 border-r border-line bg-panel2/60 backdrop-blur-2xl flex flex-col">
          <div className="p-3">
            <button className="btn-brand w-full !py-2 text-xs" onClick={startNew}>
              <Plus size={14} /> 新对话
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {loadingList ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-xs text-faint text-center py-6">还没有对话记录</div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group relative mb-0.5 rounded-md border transition-colors ${
                    convId === c.id ? "bg-brand/12 border border-brand/25" : "border border-transparent hover:bg-panel2"
                  }`}
                >
                  <button
                    onClick={() => openConversation(c.id)}
                    className="w-full text-left px-2.5 py-2 pr-7"
                  >
                    <div className="text-xs truncate">{c.title || "未命名对话"}</div>
                    <div className="text-[10px] text-faint mt-0.5">{relativeTime(c.updatedAt)}</div>
                  </button>
                  <button
                    onClick={() => deleteConversation(c.id)}
                    disabled={streaming}
                    title="删除该对话"
                    className="absolute right-1 top-1/2 -translate-y-1/2 hidden p-1 rounded text-faint transition-colors hover:text-bad group-hover:block disabled:cursor-not-allowed"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      {/* 对话主区 */}
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-brand/10 border-4 border-dashed border-brand/50 flex items-center justify-center pointer-events-none">
            <div className="bg-panel px-6 py-4 rounded-xl shadow-lg border border-brand/30">
              <div className="text-brand font-semibold mb-1">📎 松开鼠标上传附件</div>
              <div className="text-xs text-dim">支持图片、PDF、DXF、DWG，单个文件最大 20MB</div>
            </div>
          </div>
        )}
        <div className="px-5 py-3 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setSidebarVisible(!sidebarVisible)}
              className="p-1.5 rounded hover:bg-panel2 transition-colors text-faint hover:text-dim"
              title={sidebarVisible ? "隐藏历史记录" : "显示历史记录"}
            >
              {sidebarVisible ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
            <img src={logoBadge} alt="小川" className="w-8 h-8 rounded-lg" draggable={false} />
            <div>
              <div className="text-sm font-medium">小川 AI 助手</div>
              <div className="text-[11px] text-faint">可查询平台数据 · 以您的账号权限为准</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap size={12} className="text-faint" />
            {TIERS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTier(t.value)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  tier === t.value ? "bg-brand/15 text-brandhi" : "text-faint hover:text-dim"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-5">
              <img src={logoBadge} alt="小川" className="w-14 h-14 rounded-2xl shadow-[0_0_28px_rgba(238,125,44,0.25)]" draggable={false} />
              <div className="text-sm text-dim">您好，我是小川 · 大川重工 AI 助手</div>
              <div className="flex flex-col gap-2 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs text-dim panel px-3.5 py-2.5 hover:border-brand/40 hover:text-ink transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto flex flex-col gap-4">
              {messages.map((m, index) => (
                <div key={m.id} className={`msg-in flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <img src={logoBadge} alt="" className="w-7 h-7 rounded-lg shrink-0 mr-2.5 mt-0.5" draggable={false} />
                  )}
                  <div className={`max-w-[78%] flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-full rounded-xl px-3.5 py-2.5 text-sm leading-relaxed break-words ${
                      m.role === "user"
                        ? "whitespace-pre-wrap bg-brand/15 border border-brand/30"
                        : m.error
                          ? "whitespace-pre-wrap bg-bad/8 border border-bad/30 text-bad"
                          : "panel"
                    }`}
                  >
                    {m.role === "assistant" && (m.tools?.length || m.streaming || (m.reasoning || "").length > 0) && (
                      <details className="mb-1 group/think" open={m.streaming}>
                        <summary className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-faint transition-colors hover:text-dim">
                          <Brain size={11} className={m.streaming ? "text-brand animate-pulse" : ""} />
                          {m.streaming ? "思考中……" : "思考过程"}
                          {!m.streaming && <ChevronDown size={10} className="transition-transform group-open/think:rotate-180" />}
                        </summary>
                        <div className="mt-1.5 flex flex-col gap-1 rounded-lg border border-line/60 bg-panel2/60 px-2.5 py-2">
                          {(m.reasoning || "").length > 0 && (
                            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-faint">
                              {m.reasoning}
                            </div>
                          )}
                          {(m.tools || []).map((t, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-[11px] text-faint">
                              <Wrench size={10} className={t.ok ? "text-ok" : "text-bad"} />
                              <span className="text-dim">调用工具</span> <span className="mono">{t.tool}</span>
                              <span className="mono">
                                {t.ok ? "✓" : "×"} {(t.durationMs / 1000).toFixed(1)}s
                              </span>
                            </div>
                          ))}
                          {m.streaming && (
                            <div className="flex items-center gap-1.5 text-[11px] text-faint">
                              <Spinner className="!h-3 !w-3" />
                              {m.tools?.length ? "整理回答中……" : "正在检索与分析数据……"}
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                    {m.role === "assistant" && !m.error && m.content ? (
                      <>
                        <MdContent content={m.content} />
                        {m.streaming && <span className="caret-blink" />}
                      </>
                    ) : (
                      <span className={m.streaming && !m.content ? "text-faint" : ""}>
                        {m.content || "…"}
                        {m.streaming && <span className="caret-blink" />}
                      </span>
                    )}
                    {m.role === "user" && m.attachments && m.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-brand/15 pt-2">
                        {m.attachments.map((a, i) => (
                          <AttachmentChip key={`${a.name}-${i}`} att={a} />
                        ))}
                      </div>
                    )}
                    {!m.streaming && m.durationMs != null && m.role === "assistant" && (
                      <div className="text-[10px] text-faint mono mt-1.5">{(m.durationMs / 1000).toFixed(1)}s</div>
                    )}
                  </div>
                  {m.role === "assistant" && !m.streaming && m.content && (
                    <MessageActions
                      content={m.content}
                      messageId={m.messageId}
                      feedback={m.feedback ?? null}
                      canRetry={index === lastAssistantIndex && index > 0}
                      onRetry={() => retryFrom(index)}
                      onFeedback={(kind) => {
                        if (m.messageId) void submitFeedback(m.messageId, kind);
                      }}
                    />
                  )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="px-6 pb-5 pt-1">
          <div className="max-w-3xl mx-auto panel flex flex-col gap-1 p-2.5 focus-within:border-brand/50 transition-colors">
            {(pendingAttachments.length > 0 || uploadingCount > 0 || uploadError) && (
              <div className="flex flex-col gap-1 px-1">
                {(pendingAttachments.length > 0 || uploadingCount > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {pendingAttachments.map((a, i) => (
                      <AttachmentChip
                        key={`${a.url}-${i}`}
                        att={a}
                        onRemove={() => setPendingAttachments((current) => current.filter((_, index) => index !== i))}
                      />
                    ))}
                    {uploadingCount > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-1 text-[11px] text-faint">
                        <Spinner className="!h-3 !w-3" /> 正在上传 {uploadingCount} 个文件……
                      </span>
                    )}
                  </div>
                )}
                {uploadError && <div className="text-[11px] text-bad">{uploadError}</div>}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.pdf,.dxf,.dwg"
                className="hidden"
                onChange={(e) => void onFilesSelected(e.target.files)}
              />
              <button
                className="btn-ghost !rounded-full !border-0 !bg-transparent !px-2.5 !py-2.5 shrink-0 hover:text-brand"
                title="上传附件（图片 / PDF / DXF / DWG，单文件 20MB，最多 5 个）"
                disabled={streaming || uploadingCount > 0}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={15} />
              </button>
              <textarea
                className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed max-h-32 py-2 px-1 placeholder:text-faint"
                rows={2}
                placeholder="向小川提问，Enter 发送，Shift+Enter 换行"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onInputKey}
              />
              {streaming ? (
                <button className="btn-ghost !px-3 !py-2.5 shrink-0" onClick={stop} title="停止">
                  <Square size={14} />
                </button>
              ) : (
                <button className="btn-brand !px-3 !py-2.5 shrink-0" onClick={() => send()} disabled={!input.trim()}>
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
