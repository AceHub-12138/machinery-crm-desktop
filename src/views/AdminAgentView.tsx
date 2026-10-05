import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  KeyRound,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { api, getCachedUser } from "../lib/api";
import { showToast } from "../components/ui";

/** 平台契约：GET /api/admin/agent-model-configs 返回配置数组（apiKey 只给尾四位 hint） */
interface AgentModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKeyHint?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface FormState {
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

const EMPTY_FORM: FormState = { name: "", baseUrl: "", model: "", apiKey: "" };

export default function AdminAgentView() {
  const user = getCachedUser();
  const isAdmin = user?.role === "SUPER_ADMIN";
  const [configs, setConfigs] = useState<AgentModelConfig[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<AgentModelConfig[]>("/api/admin/agent-model-configs");
      if (!Array.isArray(data)) throw new Error("配置列表加载失败");
      setConfigs(data);
    } catch (err) {
      setConfigs([]);
      setError(err instanceof Error ? err.message : "配置列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  const openEdit = (config: AgentModelConfig) => {
    setEditingId(config.id);
    // 编辑已保存的 key 时不回显明文；留空=保持不变
    setForm({ name: config.name, baseUrl: config.baseUrl, model: config.model, apiKey: "" });
  };

  const closeForm = () => {
    setForm(null);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form) return;
    const name = form.name.trim();
    const baseUrl = form.baseUrl.trim();
    const model = form.model.trim();
    const apiKey = form.apiKey.trim();
    if (!name || !baseUrl || !model || (!editingId && !apiKey)) {
      showToast("请填写名称、接口地址、模型，新建时 API Key 必填", "error");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        // PATCH：apiKey 留空=保持原 Key 不变
        await api(`/api/admin/agent-model-configs/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          body: apiKey ? { name, baseUrl, model, apiKey } : { name, baseUrl, model },
        });
        showToast("配置已更新", "success");
      } else {
        await api("/api/admin/agent-model-configs", {
          method: "POST",
          body: { name, baseUrl, model, apiKey },
        });
        showToast("配置已创建", "success");
      }
      closeForm();
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存配置失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (config: AgentModelConfig) => {
    setBusyId(config.id);
    try {
      await api(`/api/admin/agent-model-configs/${encodeURIComponent(config.id)}/activate`, { method: "POST" });
      showToast(`已切换生效配置：${config.name}`, "success");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "切换生效配置失败", "error");
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async (config: AgentModelConfig) => {
    if (config.isActive) {
      showToast("该配置正在生效中，请先切换到其他配置再删除", "error");
      return;
    }
    if (!window.confirm(`确定删除配置「${config.name}」？此操作不可恢复。`)) return;
    setBusyId(config.id);
    try {
      await api(`/api/admin/agent-model-configs/${encodeURIComponent(config.id)}`, { method: "DELETE" });
      showToast("配置已删除", "success");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除配置失败", "error");
    } finally {
      setBusyId("");
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="rounded-2xl border border-line bg-panel p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 size-12 text-amber-500" />
          <p className="text-sm text-bad">无权访问 Agent 配置</p>
          <p className="mt-2 text-xs text-faint">仅超级管理员可访问此功能</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-4xl space-y-5">
          {/* 页面标题 */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-ink">Agent 模型配置</h1>
              <p className="mt-1 text-sm text-dim">
                管理小川 AI 助手的模型服务配置（对接平台 /api/admin/agent-model-configs）
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brandhi"
              >
                <Plus size={16} />
                新建配置
              </button>
              <button
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                刷新
              </button>
            </div>
          </div>

          {/* 生效说明 */}
          <div className="flex items-start gap-3 rounded-2xl border border-line bg-panel p-4">
            <Bot size={20} className="mt-0.5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1 text-sm text-dim">
              <span className="font-medium text-ink">生效规则：</span>
              全局只有一个配置处于生效状态，用于小川 AI 的模型调用（库存中不存在时回落平台环境变量）。Key
              明文仅存平台数据库加密字段，界面只显示尾四位。若平台尚未配置任何模型接口，小川会话将提示“小川服务未配置”。
            </div>
          </div>

          {/* 新建/编辑表单 */}
          {form && (
            <div className="space-y-4 rounded-2xl border border-brand/40 bg-panel p-5 shadow-sm">
              <p className="text-sm font-semibold text-ink">
                {editingId ? "编辑配置" : "新建配置"}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-dim">名称 *</label>
                  <input
                    className="input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例如：生产-GLM"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-dim">接口地址（baseUrl）*</label>
                  <input
                    className="input"
                    value={form.baseUrl}
                    onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-dim">模型 *</label>
                  <input
                    className="input"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="例如：gpt-4o / glm-4.7"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-dim">
                    API Key {editingId ? "（留空=保持不变）" : "*"}
                  </label>
                  <input
                    type="password"
                    className="input"
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder={editingId ? "留空保持原 Key" : "sk-..."}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <button onClick={closeForm} className="btn-ghost" disabled={saving}>
                  取消
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brandhi disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 size={16} />
                  {saving ? "保存中..." : editingId ? "保存修改" : "创建"}
                </button>
              </div>
            </div>
          )}

          {/* 配置列表 */}
          {loading ? (
            <div className="rounded-2xl border border-line bg-panel p-8 text-center text-sm text-dim">
              加载中...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-bad">{error}</p>
              <button onClick={() => void load()} className="mx-auto mt-4 block rounded-xl bg-brand px-4 py-2 text-sm text-white">
                重试
              </button>
            </div>
          ) : (configs || []).length === 0 ? (
            <div className="rounded-2xl border border-line bg-panel p-8 text-center">
              <p className="text-sm text-dim">
                暂无模型配置。小川 AI 将回落平台环境变量配置；如两者皆空，小川不可用。
              </p>
              <button onClick={openCreate} className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white">
                <Plus size={15} /> 新建第一个配置
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {(configs || []).map((config) => (
                <div
                  key={config.id}
                  className={`rounded-2xl border p-5 ${
                    config.isActive ? "border-good/50 bg-good/5" : "border-line bg-panel"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{config.name}</p>
                        {config.isActive ? (
                          <span className="rounded-full bg-good/10 px-2.5 py-0.5 text-xs font-medium text-good">
                            当前生效
                          </span>
                        ) : (
                          <span className="rounded-full bg-panel2 px-2.5 py-0.5 text-xs text-dim">
                            未生效
                          </span>
                        )}
                      </div>
                      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-dim sm:grid-cols-3">
                        <div className="min-w-0">
                          <dt className="text-faint">接口地址</dt>
                          <dd className="truncate text-ink">{config.baseUrl}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-faint">模型</dt>
                          <dd className="truncate text-ink">{config.model}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-faint">API Key</dt>
                          <dd className="inline-flex items-center gap-1 text-ink">
                            <KeyRound size={12} />
                            {config.apiKeyHint ? `尾四位 ${config.apiKeyHint}` : "未设置"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {!config.isActive && (
                        <button
                          onClick={() => void handleActivate(config)}
                          disabled={busyId === config.id}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-good/50 bg-good/10 px-3 py-2 text-sm font-medium text-good transition-colors hover:bg-good/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Power size={14} />
                          设为生效
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(config)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-panel2"
                      >
                        <Pencil size={14} />
                        编辑
                      </button>
                      <button
                        onClick={() => void handleDelete(config)}
                        disabled={busyId === config.id}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-bad/50 bg-bad/5 px-3 py-2 text-sm font-medium text-bad transition-colors hover:bg-bad/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
