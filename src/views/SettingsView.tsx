import { useEffect, useState } from "react";
import { Camera, ChevronDown, ChevronUp, Download, RefreshCw, RotateCcw } from "lucide-react";
import { api, getCachedUser, getServerUrl, isPreview } from "../lib/api";
import { toFetchableUploadPath, isProtectedUploadPath } from "../lib/attachments";
import { ROLE_LABEL } from "../lib/format";
import { showToast } from "../components/ui";
import { APP_NAME, CHANGELOG, CURRENT_RELEASE } from "../lib/changelog";
import { useUpdater } from "../lib/updater-client";

/** 受保护上传资源无法在本地 file:// 页面直接显示；经主进程带 Cookie 取回后转 data URL */
async function loadAvatarDataUrl(avatarPath: string): Promise<string> {
  if (!avatarPath || isPreview() || !isProtectedUploadPath(avatarPath)) return "";
  try {
    const res = await window.dachuan.fetchBinary({ baseUrl: getServerUrl(), path: toFetchableUploadPath(avatarPath) });
    const dataUrl = res.ok ? (res.json as { dataUrl?: string } | null)?.dataUrl : "";
    return typeof dataUrl === "string" ? dataUrl : "";
  } catch {
    return "";
  }
}



export default function SettingsView() {
  const user = getCachedUser();
  const [showHistory, setShowHistory] = useState(false);
  const [avatarPath, setAvatarPath] = useState("");
  /** 受保护上传资源需经主进程取回；此字段存转换后的 data: URL，空则显示姓名首字 */
  const [avatarDisplay, setAvatarDisplay] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  /** 实际安装包版本（app.getVersion()），消除与更新记录双份维护 */
  const [appVersion, setAppVersion] = useState("");
  const { event: updateEvent, check: checkUpdate, download: downloadUpdate, install: installUpdate } = useUpdater();

  useEffect(() => {
    void window.dachuan
      .appVersion()
      .then(setAppVersion)
      .catch(() => undefined);
  }, []);

  const handleCheckUpdate = async () => {
    const res = await checkUpdate();
    if (!res.ok && res.error) showToast(res.error, "error");
  };

  useEffect(() => {
    if (!user?.id) return;
    // 获取用户头像路径（平台返回受保护的 /uploads/avatars/... 或空）
    api<{ avatarPath?: string }>("/api/upload/avatar")
      .then(async (data) => {
        const path = data.avatarPath || "";
        setAvatarPath(path);
        if (path) {
          const dataUrl = await loadAvatarDataUrl(path);
          if (dataUrl) setAvatarDisplay(dataUrl);
        }
      })
      .catch(() => {
        // 头像非必需，失败不显示错误
      });
  }, [user?.id]);

  const handleAvatarUpload = async (file: File) => {
    if (!user?.id) {
      setAvatarError("当前登录状态无效，请重新登录后再试");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("图片大小不能超过 2MB");
      return;
    }

    // 平台 POST /api/upload/avatar 校验扩展名与 MIME 必须一致（image/jpg 不在其白名单）
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setAvatarError("仅支持 JPG（image/jpeg）、PNG、WEBP 格式");
      return;
    }

    setAvatarError("");
    setUploadingAvatar(true);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 平台契约：multipart 表单（userId + file），主进程组装并发送
      const result = await window.dachuan.uploadFile({
        baseUrl: getServerUrl(),
        path: "/api/upload/avatar",
        name: file.name,
        mime: file.type,
        base64,
        fields: { userId: String(user.id) },
      });

      const nextPath = result.ok ? (result.json as { avatarPath?: string } | null)?.avatarPath : "";
      if (!result.ok || !nextPath) {
        throw new Error((result.json as { error?: string } | null)?.error || result.error || "头像上传失败，请重试");
      }

      setAvatarPath(nextPath);
      const dataUrl = await loadAvatarDataUrl(nextPath);
      setAvatarDisplay(dataUrl);
      showToast("头像已更新", "success");

      // 通知其他组件更新头像
      window.dispatchEvent(new CustomEvent("dc:avatar-updated", { detail: { avatarPath: nextPath } }));
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : "头像上传失败，请重试");
      showToast(error instanceof Error ? error.message : "头像上传失败", "error");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // 与平台 settings/page.tsx 及 user-menu.tsx 的 getDataScopeLabel 保持一致；
  // viewScope 缺失时不会误判为全区域（仅 SUPER_ADMIN 才是全区域）
  const dataScope = ["PURCHASE", "WAREHOUSE"].includes(user?.role || "")
    ? "不适用"
    : user?.role === "SUPER_ADMIN" || user?.viewScope === "ALL"
      ? "全区域"
      : "按负责省市";

  const history = CHANGELOG.slice(1);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-4xl space-y-5">
          {/* 页面标题 */}
          <div>
            <h1 className="text-2xl font-semibold text-ink">系统设置</h1>
            <p className="mt-1 text-sm text-dim">个人信息、版本管理</p>
          </div>

          {/* 个人信息卡片 */}
          <div className="rounded-2xl border border-line bg-panel shadow-sm">
            <div className="border-b border-line/60 px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">当前账号信息</h2>
            </div>
            <div className="p-5 space-y-5">
              {/* 头像上传区 */}
              <div className="flex flex-wrap items-center gap-4 rounded-xl bg-panel2 p-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-line bg-surface text-lg font-medium text-dim overflow-hidden">
                  {avatarDisplay ? (
                    <img src={avatarDisplay} alt="头像" className="h-full w-full object-cover" />
                  ) : (
                    (user?.name || user?.email || "用").slice(0, 1)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">个人头像</p>
                  <p className="mt-1 text-xs text-faint">支持 JPG、JPEG、PNG、WEBP，最大 2MB</p>
                  {avatarError && (
                    <p className="mt-1 text-xs text-bad">{avatarError}</p>
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-50">
                  <Camera size={16} />
                  {uploadingAvatar ? "上传中..." : "更换头像"}
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadingAvatar}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAvatarUpload(file);
                      e.target.value = ""; // 重置以允许重新选择同一文件
                    }}
                  />
                </label>
              </div>

              {/* 账号信息 */}
              <dl className="space-y-3">
                <div className="flex items-center gap-4">
                  <dt className="w-24 text-sm text-dim">姓名</dt>
                  <dd className="text-sm font-medium text-ink">{user?.name || "-"}</dd>
                </div>
                <div className="flex items-center gap-4">
                  <dt className="w-24 text-sm text-dim">账号</dt>
                  <dd className="text-sm font-medium text-ink">{user?.email || "-"}</dd>
                </div>
                <div className="flex items-center gap-4">
                  <dt className="w-24 text-sm text-dim">角色</dt>
                  <dd className="text-sm font-medium text-ink">
                    {ROLE_LABEL[user?.role || ""] || user?.role || "-"}
                  </dd>
                </div>
                <div className="flex items-center gap-4">
                  <dt className="w-24 text-sm text-dim">数据范围</dt>
                  <dd className="text-sm font-medium text-ink">{dataScope}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 版本信息卡片 */}
          <div className="rounded-2xl border border-line bg-panel shadow-sm">
            <div className="border-b border-line/60 px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">系统版本</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-base font-semibold text-ink">
                  {APP_NAME} {appVersion || CURRENT_RELEASE.version}
                </p>
                <button
                  onClick={() => void handleCheckUpdate()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-panel px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                >
                  <RefreshCw size={15} className={updateEvent.type === "checking" ? "animate-spin" : undefined} />
                  检查更新
                </button>
              </div>
              {appVersion && appVersion !== CURRENT_RELEASE.version && (
                <p className="text-xs text-bad">安装包为 v{appVersion}，与最新更新记录 v{CURRENT_RELEASE.version} 不一致，请核对版本记录</p>
              )}

              {/* 应用内更新状态：事件流与更新横幅同源（主进程推送） */}
              {(updateEvent.type === "available" ||
                updateEvent.type === "downloading" ||
                updateEvent.type === "downloaded" ||
                updateEvent.type === "error") && (
                <div className="space-y-2 rounded-xl bg-panel2 p-4">
                  {updateEvent.type === "available" && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-ink">发现新版本 v{updateEvent.version}，可更新</p>
                      <button
                        onClick={() => void downloadUpdate()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                        type="button"
                      >
                        <Download size={13} />
                        立即更新
                      </button>
                    </div>
                  )}
                  {updateEvent.type === "downloading" && (
                    <>
                      <p className="text-sm text-ink">正在下载更新… {Math.round(updateEvent.percent)}%</p>
                      <div className="h-1.5 overflow-hidden rounded-full bg-panel">
                        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.min(100, Math.round(updateEvent.percent))}%` }} />
                      </div>
                    </>
                  )}
                  {updateEvent.type === "downloaded" && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-ink">新版本已就绪，重启应用后生效</p>
                      <button
                        onClick={() => void installUpdate()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                        type="button"
                      >
                        <RotateCcw size={13} />
                        重启并更新
                      </button>
                    </div>
                  )}
                  {updateEvent.type === "error" && <p className="text-sm text-bad">{updateEvent.message}</p>}
                </div>
              )}
              {updateEvent.type === "not-available" && (
                <p className="text-sm text-dim">已是最新版本。</p>
              )}

              {/* 当前版本更新内容 */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-dim">
                  当前版本更新内容（{CURRENT_RELEASE.date}）
                </p>
                <ol className="space-y-1.5 text-sm text-ink">
                  {CURRENT_RELEASE.notes.map((note, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="text-brand shrink-0">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* 历史版本 */}
              {history.length > 0 && (
                <div className="border-t border-line/50 pt-4">
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-1.5 text-xs font-medium text-dim transition-colors hover:text-ink"
                  >
                    {showHistory ? (
                      <>
                        <ChevronUp size={14} />
                        收起历史更新记录
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} />
                        查看历史更新记录（{history.length} 个版本）
                      </>
                    )}
                  </button>

                  {showHistory && (
                    <div className="mt-3 space-y-4">
                      {history.map((release) => (
                        <div key={release.version} className="rounded-xl border border-line/50 bg-panel2 p-4">
                          <p className="text-sm font-semibold text-ink">
                            {APP_NAME} {release.version}
                            <span className="ml-2 text-xs font-normal text-faint">
                              {release.date}
                            </span>
                          </p>
                          <ol className="mt-2 space-y-1 text-sm text-dim">
                            {release.notes.map((note, index) => (
                              <li key={index} className="flex gap-2">
                                <span className="text-brand/60 shrink-0">•</span>
                                <span>{note}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
