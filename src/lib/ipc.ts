// 渲染进程 ↔ 主进程 桥接类型
export interface ApiResult {
  status: number;
  ok: boolean;
  json?: any;
  text?: string;
  error?: string;
}

export interface DachuanBridge {
  request(payload: {
    baseUrl: string;
    path: string;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
  }): Promise<ApiResult>;
  login(payload: { baseUrl: string; email: string; password: string }): Promise<{ ok: boolean; user?: SessionUser; error?: string }>;
  session(baseUrl: string): Promise<{ user: SessionUser | null }>;
  logout(baseUrl: string): Promise<{ ok: boolean }>;
  openExternal(url: string): Promise<void>;
  setTheme(mode: "dark" | "light"): Promise<{ ok: boolean }>;
  flags(): Promise<{ preview: boolean }>;
  windowControl(action: "minimize" | "toggle-maximize" | "close"): Promise<{ maximized?: boolean } | void>;
  chatStart(payload: { reqId: string; baseUrl: string; body: unknown }): Promise<{ started: boolean }>;
  chatAbort(reqId: string): Promise<{ ok: boolean }>;
  uploadFile(payload: { baseUrl: string; path: string; name: string; mime: string; base64: string; fields?: Record<string, string> }): Promise<ApiResult>;
  fetchBinary(payload: { baseUrl: string; path: string }): Promise<ApiResult>;
  saveAttachment(payload: { baseUrl: string; path: string; name?: string }): Promise<{ saved: boolean; filePath?: string; error?: string }>;
  /** 渲染端生成的文件（xlsx 模板等）走原生另存为落盘 */
  saveFile(payload: { name: string; base64: string; mime?: string }): Promise<{ saved: boolean; filePath?: string; error?: string }>;
  onChatEvent(cb: (payload: { reqId: string; data: ChatEvent }) => void): () => void;
  /** 应用内自动更新（未打包开发环境返回 disabled/error） */
  appVersion(): Promise<string>;
  updateState(): Promise<UpdateEvent>;
  updateCheck(baseUrl?: string): Promise<{ ok: boolean; disabled?: boolean; error?: string }>;
  updateDownload(): Promise<{ ok: boolean; error?: string }>;
  updateInstall(): Promise<{ ok: boolean; error?: string }>;
  onUpdateEvent(cb: (event: UpdateEvent) => void): () => void;
}

/** 主进程推送的更新器事件（electron/updater.ts 同步定义） */
export type UpdateEvent =
  | { type: "idle" }
  | { type: "checking" }
  | { type: "available"; version: string; releaseDate?: string }
  | { type: "not-available" }
  | { type: "downloading"; percent: number; transferred?: number; total?: number; bytesPerSecond?: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

/** 小川消息附件（与平台 XiaochuanAttachment 对齐，展示用） */
export interface ChatAttachment {
  url: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "pdf" | "cad";
}

export type ChatEvent =
  | { type: "meta"; conversationId: string; userMessageId: string; tier: string }
  | { type: "delta"; text: string }
  /** 混合推理模型的思考内容增量（平台 2026-09 一期新增，仅流式展示，不落库） */
  | { type: "reasoning"; text: string }
  | { type: "tool"; tool: string; ok: boolean; durationMs: number }
  | { type: "done"; messageId: string; promptTokens?: number; completionTokens?: number; durationMs?: number; error?: boolean }
  | { type: "error"; message: string; status?: number }
  | { type: "__end__" }
  | { type: "__aborted__" };

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string;
  region?: string;
  /** 数据范围：ALL=全区域，TERRITORY=按负责省市（平台 /api/auth/session 注入，缺省按 TERRITORY 处理） */
  viewScope?: string;
  image?: string | null;
}

declare global {
  interface Window {
    dachuan: DachuanBridge;
  }
}
