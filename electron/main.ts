import { app, BrowserWindow, Tray, Menu, session, ipcMain, shell, nativeImage, net, dialog } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import { SSEParser } from "./sse-parser";
import { registerUpdaterIpc, setupUpdater } from "./updater";

// 诊断日志落文件（userData/desktop-diag.log）：explorer/计划任务等方式启动时拿不到控制台
function diag(line: string) {
  try {
    fs.appendFileSync(path.join(app.getPath("userData"), "desktop-diag.log"), `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    /* 日志失败不影响运行 */
  }
}

const DEV_URL = process.env.VITE_DEV_SERVER_URL || "";
const PARTITION = "persist:dachuan";

// 测试/预览隔离：--dc-user-data=<目录> 把用户数据指到独立位置，
// 单实例锁与会话存储随之隔离，可与正式安装的实例并存跑自动化验证
const userDataArg = process.argv.find((a) => a.startsWith("--dc-user-data="));
if (userDataArg) {
  const dir = userDataArg.slice("--dc-user-data=".length).trim();
  if (dir) app.setPath("userData", dir);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

const gotLock = app.requestSingleInstanceLock();
diag(`startup, singleInstanceLock=${gotLock}, packaged=${app.isPackaged}, gpu=on`);
console.log("[desktop] startup, singleInstanceLock =", gotLock);
// GPU 硬件加速保持开启：玻璃拟态（backdrop-filter）与入场动效在软渲染下会严重掉帧，
// 且软合成器在该机器上会把顶部光斑错画成绿色横带。此前禁用 GPU 是因 GPU 进程崩溃——
// 真凶是 360 注入，卸载 360 后已无此问题；若 GPU 进程再崩，Chromium 会自动降级软渲染并在 diag 留痕
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());
  // 诊断：记录所有子进程退出原因（renderer/gpu/utility/network）
  app.on("child-process-gone", (_e, details) => {
    const line = `child gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode} name=${details.name || "-"}`;
    diag(line);
    console.error("[desktop]", line);
  });
  app.whenReady().then(() => {
    diag("app ready, creating window");
    console.log("[desktop] app ready, creating window");
    onReady();
  });
}

app.on("before-quit", () => {
  quitting = true;
});

// 诊断：记录所有子进程退出原因（renderer/gpu/utility/network）
app.on("child-process-gone", (_e, details) => {
  console.error(`[desktop] child gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode} name=${details.name || "-"}`);
});

app.on("window-all-closed", () => {
  // Windows：关闭窗口只是隐藏到托盘，不退出进程
});

function getSession() {
  return session.fromPartition(PARTITION);
}

function onReady() {
  Menu.setApplicationMenu(null);
  // 强制开启渲染进程无障碍树：便于自动化测试与辅助工具定位界面元素
  app.setAccessibilitySupportEnabled(true);
  createWindow();
  createTray();
  // 应用内自动更新（未打包的开发环境内部自动跳过）
  setupUpdater();
}

function iconPath() {
  return path.join(__dirname, "icon.png");
}

function trayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, "tray.png"));
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 720,
    show: false,
    backgroundColor: "#131416",
    frame: false,
    titleBarStyle: "hidden",
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: PARTITION,
      spellcheck: false,
      // Chromium 内置 PDF 阅读器（PDFium）以插件形式提供：附件要在应用内预览 PDF 必须开启
      plugins: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    diag("ready-to-show, showing window");
    mainWindow?.show();
  });
  mainWindow.webContents.on("did-finish-load", () => diag("did-finish-load"));
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => diag(`did-fail-load: ${code} ${desc} ${url}`));
  // 渲染端报错（含 CSP 拦截、附件预览失败）落诊断日志，便于现场只拿到日志时定位
  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) diag(`renderer console[${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[desktop] renderer gone:", details.reason, "exitCode =", details.exitCode);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e) => {
    // 单页应用，禁止任何页面级跳转
    e.preventDefault();
  });
  if (DEV_URL) {
    mainWindow.webContents.on("before-input-event", (_e, input) => {
      if (input.type === "keyDown" && input.control && input.shift && input.key.toLowerCase() === "i") {
        mainWindow?.webContents.toggleDevTools();
      }
    });
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("大川Pro工作台");
  tray.setIgnoreDoubleClickEvents(true);
  const menu = Menu.buildFromTemplate([
    { label: "显示主窗口", click: () => showMainWindow() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ---------- 工具 ----------

function normalizeBaseUrl(raw: unknown): string {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) throw new Error("服务器地址需以 http:// 或 https:// 开头");
  return value;
}

interface ApiResult {
  status: number;
  ok: boolean;
  json?: unknown;
  text?: string;
  error?: string;
}

async function platformFetch(
  baseUrl: string,
  pathname: string,
  init: { method?: string; body?: string; headers?: Record<string, string>; redirect?: RequestRedirect; signal?: AbortSignal } = {},
): Promise<Response> {
  const target = normalizeBaseUrl(baseUrl) + pathname;
  // 使用 session.fetch() 而不是 net.fetch()，以确保请求使用指定的会话分区
  const request = getSession().fetch(target, {
    method: init.method || "GET",
    headers: init.headers,
    body: init.body,
    redirect: init.redirect,
    ...(init.signal ? { signal: init.signal } : {}),
  }) as unknown as Promise<Response>;
  if (init.signal) {
    // session.fetch 不透传外部 signal；中断时同步取消会话内响应流（含未完成的请求体）
    const onAbort = () => {
      request.then((res) => res.body?.cancel().catch(() => undefined), () => undefined);
    };
    if (init.signal.aborted) onAbort();
    else init.signal.addEventListener("abort", onAbort, { once: true });
  }
  return request;
}

async function readResult(res: Response): Promise<ApiResult> {
  const text = await res.text().catch(() => "");
  let json: unknown = undefined;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, ok: res.ok, json, text: json === undefined ? text : undefined };
}

async function getCsrf(baseUrl: string): Promise<string> {
  const res = await platformFetch(baseUrl, "/api/auth/csrf");
  if (!res.ok) throw new Error(`无法连接服务器（${res.status}），请检查服务器地址`);
  const data = (await res.json()) as { csrfToken?: string };
  if (!data.csrfToken) throw new Error("服务器未返回登录凭据");
  return data.csrfToken;
}

// ---------- IPC ----------

ipcMain.handle("api:request", async (_e, payload: {
  baseUrl: string;
  path: string;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}): Promise<ApiResult> => {
  try {
    const qs = payload.query
      ? "?" + new URLSearchParams(Object.entries(payload.query).filter(([, v]) => v !== undefined && v !== "") as [string, string][]).toString()
      : "";
    const hasBody = payload.body !== undefined;
    const res = await platformFetch(payload.baseUrl, payload.path + qs, {
      method: payload.method || "GET",
      body: hasBody ? JSON.stringify(payload.body) : undefined,
      headers: hasBody ? { "content-type": "application/json" } : undefined,
    });
    return await readResult(res);
  } catch (err) {
    return { status: 0, ok: false, error: `网络错误：${(err as Error).message}` };
  }
});

ipcMain.handle("auth:login", async (_e, payload: { baseUrl: string; email: string; password: string }) => {
  try {
    const base = normalizeBaseUrl(payload.baseUrl);
    const csrfToken = await getCsrf(base);
    const form = new URLSearchParams({ csrfToken, email: payload.email, password: payload.password, callbackUrl: base + "/", json: "true" });
    await getSession().fetch(base + "/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    // 注意：session.fetch 默认 follow redirect，Set-Cookie 在跳转前已写入会话分区，随后用会话接口验证登录结果
    const sess = await platformFetch(base, "/api/auth/session");
    const data = (await sess.json().catch(() => null)) as { user?: unknown } | null;
    const user = data && typeof data === "object" && data.user ? data.user : null;
    return { ok: !!user, user };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle("auth:session", async (_e, baseUrl: string) => {
  try {
    const res = await platformFetch(baseUrl, "/api/auth/session");
    const data = (await res.json().catch(() => null)) as { user?: unknown } | null;
    return { user: data && typeof data === "object" && data.user ? data.user : null };
  } catch {
    return { user: null };
  }
});

ipcMain.handle("auth:logout", async (_e, baseUrl: string) => {
  try {
    const base = normalizeBaseUrl(baseUrl);
    const csrfToken = await getCsrf(base);
    const form = new URLSearchParams({ csrfToken, callbackUrl: base + "/", json: "true" });
    await getSession().fetch(base + "/api/auth/signout", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }).catch(() => null);
  } catch {
    // 网络失败不阻止本地清理
  } finally {
    // 确保本地 Cookie 清理始终执行
    await getSession().clearStorageData({ storages: ["cookies"] });
    // 额外清理默认 session 中可能残留的凭据（兼容旧版本）
    await session.defaultSession.clearStorageData({ storages: ["cookies"] });
  }
  return { ok: true };
});

ipcMain.handle("app:open-external", async (_e, url: string) => {
  if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
});

// 主题切换：自绘标题栏后仅作为偏好持久化信号（原生层不再参与着色）
ipcMain.handle("app:set-theme", async (_e, mode: string) => {
  return { ok: true, mode };
});

// 自绘窗口控制按钮（彻底弃用原生 titleBarOverlay：其颜色在该系统上渲染异常）
ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow) return { maximized: false };
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return { maximized: mainWindow.isMaximized() };
});
ipcMain.handle("window:close", () => mainWindow?.close());

// 预览模式（--dc-preview 启动）：跳过登录渲染界面骨架，配合内置示例数据用于 UI 调整
const isPreviewMode = () => process.argv.includes("--dc-preview") || process.env.DC_PREVIEW === "1";

ipcMain.handle("app:flags", async () => ({
  preview: isPreviewMode(),
}));

// ---------- 应用内自动更新（electron-updater，逻辑在 updater.ts） ----------

registerUpdaterIpc();

// ---------- 小川附件上传：渲染端传 base64，主进程组装 multipart 走会话 Cookie ----------

ipcMain.handle("upload:file", async (_e, payload: {
  baseUrl: string;
  path: string;
  name: string;
  mime: string;
  base64: string;
  /** 平台接口从 multipart 表单字段读取的额外键值对（如头像接口的 userId） */
  fields?: Record<string, string>;
}): Promise<ApiResult> => {
  // 预览模式：拒绝真实上传
  if (isPreviewMode()) {
    return { status: 403, ok: false, error: "预览模式不支持上传操作" };
  }
  try {
    const bytes = Buffer.from(payload.base64, "base64");
    const form = new FormData();
    for (const [key, value] of Object.entries(payload.fields || {})) {
      if (value !== undefined && value !== null) form.append(key, String(value));
    }
    form.append("file", new Blob([bytes], { type: payload.mime || "application/octet-stream" }), payload.name);
    const res = await getSession().fetch(normalizeBaseUrl(payload.baseUrl) + payload.path, {
      method: "POST",
      body: form,
    });
    return await readResult(res);
  } catch (err) {
    return { status: 0, ok: false, error: `网络错误：${(err as Error).message}` };
  }
});

// ---------- 二进制取回（受保护的上传资源） ----------

/** 预览模式示例文件：让附件预览在 --dc-preview 下也能验证（不访问服务器） */
function previewSample(pathname: string): { dataUrl: string; mime: string; size: number } {
  const ext = path.extname(pathname.split("?")[0]).toLowerCase();
  if (ext === ".pdf") {
    const buf = buildSamplePdf();
    return { dataUrl: `data:application/pdf;base64,${buf.toString("base64")}`, mime: "application/pdf", size: buf.length };
  }
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".svg"].includes(ext)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#2a2d33"/><circle cx="240" cy="140" r="58" fill="#4c8dff" opacity="0.5"/><text x="240" y="250" fill="#c9ced6" font-family="sans-serif" font-size="18" text-anchor="middle">预览模式示例图片</text></svg>`;
    const buf = Buffer.from(svg, "utf8");
    return { dataUrl: `data:image/svg+xml;base64,${buf.toString("base64")}`, mime: "image/svg+xml", size: buf.length };
  }
  const text = Buffer.from("预览模式示例附件：此处显示受保护上传资源的文本内容。\n", "utf8");
  return { dataUrl: `data:text/plain;base64,${text.toString("base64")}`, mime: "text/plain", size: text.length };
}

/** 手写一份带 xref 的最小合法单页 PDF（仅 ASCII 文本，避免字体依赖） */
function buildSamplePdf(): Buffer {
  const content = "BT /F1 20 Tf 40 150 Td (DachuanPro Preview PDF) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 240] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

// 平台把 /uploads/* 重写为 /api/uploads/*（带鉴权），响应体是文件本身而非 JSON；
// 本地 file:// 页面无法直接用相对路径显示这些图片，必须经会话 Cookie 取回后转 data URL
ipcMain.handle("fetch:binary", async (_e, payload: { baseUrl: string; path: string }): Promise<ApiResult> => {
  if (isPreviewMode()) {
    return { status: 200, ok: true, json: previewSample(payload.path) };
  }
  try {
    const res = await platformFetch(payload.baseUrl, payload.path);
    if (!res.ok) {
      return { status: res.status, ok: false, error: `资源获取失败（${res.status}）` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const dataUrl = `data:${contentType};base64,${buf.toString("base64")}`;
    return { status: 200, ok: true, json: { dataUrl, mime: contentType, size: buf.length } };
  } catch (err) {
    return { status: 0, ok: false, error: `网络错误：${(err as Error).message}` };
  }
});

// ---------- 附件另存为（应用内下载：不支持预览的格式由用户选择落盘位置） ----------

ipcMain.handle("attachment:save", async (
  _e,
  payload: { baseUrl: string; path: string; name?: string },
): Promise<{ saved: boolean; filePath?: string; error?: string }> => {
  if (isPreviewMode()) return { saved: false, error: "预览模式不支持下载附件" };
  try {
    const res = await platformFetch(payload.baseUrl, payload.path);
    if (!res.ok) return { saved: false, error: `资源获取失败（${res.status}）` };
    const buf = Buffer.from(await res.arrayBuffer());
    const name = (payload.name || decodeURIComponent(payload.path.split("?")[0].split("/").pop() || "attachment"))
      .replace(/[\\/:*?"<>|]/g, "_");
    const target = mainWindow
      ? await dialog.showSaveDialog(mainWindow, { defaultPath: name })
      : await dialog.showSaveDialog({ defaultPath: name });
    if (target.canceled || !target.filePath) return { saved: false };
    await fs.promises.writeFile(target.filePath, buf);
    return { saved: true, filePath: target.filePath };
  } catch (err) {
    return { saved: false, error: `保存失败：${(err as Error).message}` };
  }
});

// ---------- 渲染端生成的文件另存为（ERP 物料导入模板等本地生成内容） ----------

ipcMain.handle("file:save", async (
  _e,
  payload: { name: string; base64: string; mime?: string },
): Promise<{ saved: boolean; filePath?: string; error?: string }> => {
  try {
    const name = (payload.name || "export.xlsx").replace(/[\/:*?"<>|]/g, "_");
    const target = mainWindow
      ? await dialog.showSaveDialog(mainWindow, { defaultPath: name })
      : await dialog.showSaveDialog({ defaultPath: name });
    if (target.canceled || !target.filePath) return { saved: false };
    await fs.promises.writeFile(target.filePath, Buffer.from(payload.base64, "base64"));
    return { saved: true, filePath: target.filePath };
  } catch (err) {
    return { saved: false, error: `保存失败：${(err as Error).message}` };
  }
});


// ---------- 小川 SSE 流式转发 ----------

const chatAborts = new Map<string, AbortController>();

ipcMain.handle("chat:start", async (event, payload: { reqId: string; baseUrl: string; body: unknown }) => {
  // 预览模式：拒绝真实 AI 请求
  if (isPreviewMode()) {
    const sender = event.sender;
    if (!sender.isDestroyed()) {
      sender.send("chat:event", { reqId: payload.reqId, data: { type: "error", message: "预览模式不支持 AI 对话" } });
    }
    return { started: false };
  }

  const sender = event.sender;
  const send = (data: unknown) => {
    if (!sender.isDestroyed()) sender.send("chat:event", { reqId: payload.reqId, data });
  };
  const controller = new AbortController();
  chatAborts.set(payload.reqId, controller);

  (async () => {
    const parser = new SSEParser();
    try {
      // signal 随平台请求下发：渲染端中断时上游请求同步取消，不再白跑
      const res = await platformFetch(payload.baseUrl, "/api/agent/chat", {
        method: "POST",
        body: JSON.stringify(payload.body),
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!res.ok) {
        const result = await readResult(res);
        const message = (result.json as { error?: string })?.error || result.error || `请求失败（${res.status}）`;
        send({ type: "error", message, status: res.status });
        return;
      }
      const body = res.body;
      if (!body) {
        send({ type: "error", message: "服务器未返回数据流" });
        return;
      }
      for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
        if (controller.signal.aborted) break;
        for (const data of parser.feed(chunk)) {
          try {
            send(JSON.parse(data));
          } catch {
            /* 忽略无法解析的事件块 */
          }
        }
      }
      if (controller.signal.aborted) return;
      for (const data of parser.flush()) {
        try {
          send(JSON.parse(data));
        } catch {
          /* 忽略无法解析的事件块 */
        }
      }
      send({ type: "__end__" });
    } catch (err) {
      if (controller.signal.aborted) send({ type: "__aborted__" });
      else send({ type: "error", message: `连接中断：${(err as Error).message}` });
    } finally {
      chatAborts.delete(payload.reqId);
    }
  })();

  return { started: true };
});

ipcMain.handle("chat:abort", async (_e, reqId: string) => {
  chatAborts.get(reqId)?.abort();
  return { ok: true };
});
