import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api, getServerUrl } from "../lib/api";
import {
  ADDRESS_LEVEL_OPTIONS,
  buildConfigFromForm,
  buildShareUrl,
  CONTRACT_NUMBER_MODE_OPTIONS,
  COPY_FAIL_NOTICE,
  COPY_OK_NOTICE,
  DEFAULT_SALES_SCREEN_CONFIG,
  findSalesScreenSetting,
  formatShareTime,
  formFromConfig,
  MODULE_OPTIONS,
  MULTIPLIER_OPTIONS,
  normalizeSalesScreenConfig,
  PUBLIC_DATA_NOTICE,
  REVOKE_CONFIRM_COPY,
  ROTATE_CONFIRM_COPY,
  SALES_SCREEN_SETTING_KEY,
  SHARE_GENERATED_NOTICE,
  SHARE_REVOKED_NOTICE,
  SHARE_ROTATED_NOTICE,
  SAVE_OK_NOTICE,
  type MultiplierField,
  type ModuleField,
  type SalesScreenConfig,
  type SalesScreenFormState,
  type SalesScreenShareView,
} from "../lib/sales-screen";
import { ConfirmDialog, showToast, Spinner, Switch } from "./ui";
import type { SettingRow } from "../types";

/** 平台管理 → 系统配置：展厅大屏配置与共享链接（与 Web 配置中心同一 JSON 契约、同一管理接口、同一文案）。
 * 权限由 AdminConfigView 的超管门禁与平台服务端共同保证；此处校验只用于提交体验。 */

type ShareConfirmAction = "rotate" | "revoke";

const sharePathPattern = (path: string | null): path is string => !!path && path !== "";

export function SalesScreenConfigSections() {
  const [form, setForm] = useState<SalesScreenFormState>(() => formFromConfig(DEFAULT_SALES_SCREEN_CONFIG));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [shareView, setShareView] = useState<SalesScreenShareView | null>(null);
  const [shareLoading, setShareLoading] = useState(true);
  const [shareBusy, setShareBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ShareConfirmAction | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const data = await api<{ items: SettingRow[] }>("/api/system/settings");
      setForm(formFromConfig(findSalesScreenSetting(data?.items)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "配置加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadShare = useCallback(async () => {
    try {
      const view = await api<SalesScreenShareView>("/api/system/sales-screen/share", { method: "GET" });
      setShareView(view);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "共享链接操作失败", "error");
    } finally {
      setShareLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadShare();
  }, [loadConfig, loadShare]);

  const handleSave = async () => {
    if (saving || loading) return;
    const parsed = buildConfigFromForm(form);
    if (!parsed.ok) {
      showToast(parsed.error, "error");
      return;
    }
    setSaving(true);
    try {
      const row = await api<{ value?: unknown }>("/api/system/settings", {
        method: "PUT",
        body: { key: SALES_SCREEN_SETTING_KEY, value: parsed.config },
      });
      setForm(formFromConfig(normalizeSalesScreenConfig(row?.value ?? parsed.config)));
      showToast(SAVE_OK_NOTICE, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const runShareMutation = async (method: "POST" | "DELETE", successNotice: string) => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const view = await api<SalesScreenShareView>("/api/system/sales-screen/share", { method });
      setShareView(view);
      showToast(successNotice, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "共享链接操作失败", "error");
    } finally {
      setShareBusy(false);
    }
  };

  const fullShareUrl = shareView && sharePathPattern(shareView.path) ? buildShareUrl(getServerUrl(), shareView.path) : "";

  const handleCopy = async () => {
    if (!fullShareUrl) return;
    try {
      await navigator.clipboard.writeText(fullShareUrl);
      showToast(COPY_OK_NOTICE, "success");
    } catch {
      showToast(COPY_FAIL_NOTICE, "error");
    }
  };

  const handlePreview = () => {
    if (!fullShareUrl) return;
    void window.dachuan.openExternal(fullShareUrl);
  };

  const hasLink = !!shareView && sharePathPattern(shareView.path);
  const isRevoked = !hasLink && !!shareView?.share.revokedAt;

  return (
    <>
      {/* 展厅大屏配置 */}
      <section className="space-y-4 rounded-2xl border border-line bg-panel p-6 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-ink">展厅大屏配置</h2>
          <p className="mt-1 text-xs text-dim">
            配置展厅 LED 大屏展示的板块、展示倍率与隐私口径。{PUBLIC_DATA_NOTICE}
          </p>
        </div>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-dim">
            <span className="font-medium text-ink">大屏总开关</span>
            <span className="ml-2 text-xs">关闭后共享链接打开的大屏统一显示「大屏不可用」。</span>
          </span>
          <Switch checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} />
        </label>

        <div>
          <h3 className="text-sm font-semibold text-ink">展示板块</h3>
          <p className="mt-1 text-xs text-dim">至少启用一个板块；关闭的板块在大屏上消失，其余板块自动重排。</p>
          <div className="mt-2 space-y-2">
            {MODULE_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-dim">
                  <span className="font-medium text-ink">{option.label}</span>
                  <span className="ml-2 text-xs">{option.description}</span>
                </span>
                <Switch
                  checked={form.modules[option.key]}
                  onChange={(enabled) => setForm({ ...form, modules: { ...form.modules, [option.key]: enabled } })}
                />
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink">展示倍率</h3>
          <p className="mt-1 text-xs text-dim">只作用于大屏展示数值，整数 1～100；平台内部统计始终为真实数据。</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {MULTIPLIER_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-dim">
                  <span className="font-medium text-ink">{option.label}</span>
                  <span className="ml-2 text-xs">{option.description}</span>
                </span>
                <input
                  type="number"
                  aria-label={option.label}
                  min={1}
                  max={100}
                  step={1}
                  className="w-20 rounded-xl border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  value={form.multiplierText[option.key]}
                  onChange={(e) =>
                    setForm({ ...form, multiplierText: { ...form.multiplierText, [option.key]: e.target.value } })
                  }
                />
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm text-dim">
            合同编号显示
            <select
              aria-label="合同编号显示"
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              value={form.privacy.contractNumberMode}
              onChange={(e) =>
                setForm({
                  ...form,
                  privacy: { ...form.privacy, contractNumberMode: e.target.value as SalesScreenConfig["privacy"]["contractNumberMode"] },
                })
              }
            >
              {CONTRACT_NUMBER_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-dim">
            地址粒度
            <select
              aria-label="地址粒度"
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              value={form.privacy.addressLevel}
              onChange={(e) =>
                setForm({
                  ...form,
                  privacy: { ...form.privacy, addressLevel: e.target.value as SalesScreenConfig["privacy"]["addressLevel"] },
                })
              }
            >
              {ADDRESS_LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-dim">
            <span className="font-medium text-ink">展厅演示数据</span>
            <span className="ml-2 text-xs">在大屏角落显示「展厅演示数据，仅供展示」标识。</span>
          </span>
          <Switch
            checked={form.privacy.showDisplayNotice}
            onChange={(enabled) => setForm({ ...form, privacy: { ...form.privacy, showDisplayNotice: enabled } })}
          />
        </label>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving}
          className="mt-1 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brandhi disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Spinner className="!h-4 !w-4" /> : <Save size={16} />}
          {saving ? "保存中..." : "保存大屏配置"}
        </button>
      </section>

      {/* 展厅大屏共享链接 */}
      <section className="space-y-4 rounded-2xl border border-line bg-panel p-6 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-ink">展厅大屏共享链接</h2>
          <p className="mt-1 text-xs text-dim">
            生成后 LED 屏电脑无需登录 CRM，打开链接即可展示；链接可随时重新生成或撤销。
          </p>
        </div>

        {shareLoading ? <p className="text-sm text-dim">正在加载共享状态…</p> : null}

        {!shareLoading && hasLink ? (
          <div>
            <p className="text-sm font-medium text-good">共享链接生效中</p>
            <code className="mt-1 block break-all rounded-xl border border-line bg-surface p-2 text-xs text-ink">
              {shareView?.path}
            </code>
            <p className="mt-1 text-xs text-faint">
              {shareView?.share.createdAt ? `生成于 ${formatShareTime(shareView.share.createdAt)}` : null}
              {shareView?.share.rotatedAt ? ` · 轮换于 ${formatShareTime(shareView.share.rotatedAt)}` : null}
            </p>
          </div>
        ) : null}

        {!shareLoading && isRevoked ? (
          <div>
            <p className="text-sm font-medium text-bad">共享链接已撤销</p>
            <p className="mt-1 text-xs text-faint">
              {shareView?.share.revokedAt ? `撤销于 ${formatShareTime(shareView.share.revokedAt)}` : null}
            </p>
          </div>
        ) : null}

        {!shareLoading && !hasLink && !isRevoked ? <p className="text-sm text-dim">尚未生成共享链接。</p> : null}

        <div className="flex flex-wrap gap-2">
          {hasLink ? (
            <>
              <button type="button" className="btn-ghost" disabled={shareBusy} onClick={() => void handleCopy()}>
                复制链接
              </button>
              <button type="button" className="btn-ghost" disabled={shareBusy} onClick={handlePreview}>
                浏览器预览
              </button>
              <button type="button" className="btn-ghost" disabled={shareBusy} onClick={() => setConfirmAction("rotate")}>
                重新生成链接
              </button>
              <button type="button" className="btn-ghost !text-bad" disabled={shareBusy} onClick={() => setConfirmAction("revoke")}>
                撤销链接
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-brand inline-flex items-center gap-2"
              disabled={shareBusy || shareLoading}
              onClick={() => void runShareMutation("POST", SHARE_GENERATED_NOTICE)}
            >
              {shareBusy ? <Spinner className="!h-4 !w-4" /> : null}
              生成链接
            </button>
          )}
        </div>
      </section>

      {confirmAction ? (
        <ConfirmDialog
          title={confirmAction === "rotate" ? ROTATE_CONFIRM_COPY.title : REVOKE_CONFIRM_COPY.title}
          message={confirmAction === "rotate" ? ROTATE_CONFIRM_COPY.message : REVOKE_CONFIRM_COPY.message}
          confirmText={confirmAction === "rotate" ? ROTATE_CONFIRM_COPY.confirmText : REVOKE_CONFIRM_COPY.confirmText}
          danger={confirmAction === "rotate" ? ROTATE_CONFIRM_COPY.danger : REVOKE_CONFIRM_COPY.danger}
          busy={shareBusy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            const action = confirmAction;
            setConfirmAction(null);
            if (action === "rotate") void runShareMutation("POST", SHARE_ROTATED_NOTICE);
            if (action === "revoke") void runShareMutation("DELETE", SHARE_REVOKED_NOTICE);
          }}
        />
      ) : null}
    </>
  );
}
