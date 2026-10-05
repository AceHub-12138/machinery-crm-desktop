import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import * as fs from "node:fs";
import * as path from "node:path";
import { updateFeedUrl } from "./update-feed";

// ---------- 应用内自动更新 ----------
// feed 指向平台公开下载目录（/api/downloads/desktop，免登录）：
// 发布流程 = 出包后把 exe + exe.blockmap + latest.yml 三个文件传到服务器
// /opt/machinery-crm-uploads/downloads/desktop/ 即完成一次发版，老客户端自动提示更新。
// 默认"提示后手动更新"：检测到新版本只通知渲染端，用户点"立即更新"才下载。

function diag(line: string) {
  try {
    fs.appendFileSync(path.join(app.getPath("userData"), "desktop-diag.log"), `[${new Date().toISOString()}] [updater] ${line}\n`);
  } catch {
    /* 日志失败不影响运行 */
  }
}

export type UpdateEvent =
  | { type: "idle" }
  | { type: "checking" }
  | { type: "available"; version: string; releaseDate?: string }
  | { type: "not-available" }
  | { type: "downloading"; percent: number; transferred?: number; total?: number; bytesPerSecond?: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

/** 默认 feed：跟随 electron-builder.yml 的 publish 配置（平台正式服务器） */
const DEFAULT_FEED = "https://dachuan.pro/api/downloads/desktop";

/** 本地联调可用 --dc-update-url=<地址> 或环境变量 DC_UPDATE_URL 覆盖 feed（如指向本机静态目录） */
function resolveFeedOverride(): string | null {
  const arg = process.argv.find((a) => a.startsWith("--dc-update-url="));
  const raw = arg ? arg.slice("--dc-update-url=".length) : process.env.DC_UPDATE_URL;
  const value = (raw || "").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(value) ? value : null;
}

let lastEvent: UpdateEvent = { type: "idle" };
let checking = false;

function emit(event: UpdateEvent) {
  lastEvent = event;
  if (event.type === "error") diag(`error: ${event.message}`);
  else if (event.type === "available" || event.type === "downloaded") diag(`${event.type}: v${event.version}`);
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send("app:update-event", event);
}

/** 开发/未打包环境没有 app-update.yml，更新器整体不启用 */
function updateDisabledReason(): string | null {
  if (!app.isPackaged) return "开发模式不支持更新";
  return null;
}

function applyFeed(baseUrl?: string) {
  const override = resolveFeedOverride();
  const url = override || updateFeedUrl(baseUrl, DEFAULT_FEED);
  // useMultipleRangeRequest=false：平台的下载路由只实现单段 Range（多段请求会回整包 200），
  // electron-updater 默认发多段请求 → 被判「服务器不支持」→ 回退整包下载（99.6MB）。
  // 改走单段 Range（服务器支持 206）后才能真正只下差异块（实测 1.1.0→1.1.1 只需 1.6% 流量）。
  autoUpdater.setFeedURL({ provider: "generic", url, useMultipleRangeRequest: false });
  return url;
}

async function checkForUpdates(baseUrl?: string): Promise<{ ok: boolean; disabled?: boolean; error?: string }> {
  const disabled = updateDisabledReason();
  if (disabled) return { ok: false, disabled: true, error: disabled };
  if (checking) return { ok: false, error: "正在检查更新" };
  checking = true;
  emit({ type: "checking" });
  const url = applyFeed(baseUrl);
  diag(`checking feed=${url}, current=v${app.getVersion()}`);
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    // 检查失败（断网/服务器未就绪）只按错误事件提示，不打断使用
    emit({ type: "error", message: `检查更新失败：${(err as Error).message}` });
    return { ok: false, error: (err as Error).message };
  } finally {
    checking = false;
  }
}

export function setupUpdater() {
  if (updateDisabledReason()) return;

  autoUpdater.autoDownload = false; // 提示后由用户决定是否下载
  autoUpdater.autoInstallOnAppQuit = true; // 已下载未重启时，退出应用自动装上，下次启动即新版本
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.disableWebInstaller = true; // 只发完整安装包，不发 web 安装器（否则每次下载都刷一条 warn）
  autoUpdater.logger = {
    info: (m: unknown) => diag(`info: ${String(m)}`),
    warn: (m: unknown) => diag(`warn: ${String(m)}`),
    error: (m: unknown) => diag(`error: ${String(m)}`),
    debug: () => undefined,
  };

  autoUpdater.on("checking-for-update", () => emit({ type: "checking" }));
  autoUpdater.on("update-available", (info) => emit({ type: "available", version: info.version, releaseDate: info.releaseDate }));
  autoUpdater.on("update-not-available", () => emit({ type: "not-available" }));
  autoUpdater.on("download-progress", (progress) =>
    emit({
      type: "downloading",
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    }),
  );
  autoUpdater.on("update-downloaded", (info) => emit({ type: "downloaded", version: info.version }));
  autoUpdater.on("error", (err) => emit({ type: "error", message: `更新失败：${(err as Error).message}` }));

  app.whenReady().then(() => {
    // 启动 15 秒后静默检查一次（默认 feed），失败静默——渲染端登录后还会按当前服务器地址复查
    setTimeout(() => {
      void checkForUpdates();
    }, 15_000);
    // 每 4 小时复查一次，覆盖长期不关窗的场景
    setInterval(() => {
      void checkForUpdates();
    }, 4 * 60 * 60 * 1000);
  });
}

export function registerUpdaterIpc() {
  ipcMain.handle("app:version", () => app.getVersion());

  ipcMain.handle("app:update-state", () => lastEvent);

  ipcMain.handle("app:update-check", async (_e, baseUrl?: string) => checkForUpdates(baseUrl));

  ipcMain.handle("app:update-download", async () => {
    if (updateDisabledReason()) return { ok: false, error: "开发模式不支持更新" };
    if (lastEvent.type !== "available") return { ok: false, error: "没有待下载的新版本" };
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      emit({ type: "error", message: `下载失败：${(err as Error).message}` });
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle("app:update-install", () => {
    if (updateDisabledReason()) return { ok: false, error: "开发模式不支持更新" };
    if (lastEvent.type !== "downloaded") return { ok: false, error: "新版本尚未下载完成" };
    diag("quit-and-install");
    // 静默安装沿用原目录，装完自动拉起新版本
    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  });
}
