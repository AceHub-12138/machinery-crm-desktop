import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Activity, Database, Lock, ShieldCheck, ClipboardCheck } from "lucide-react";
import { api, getCachedUser, getServerUrl } from "../lib/api";
import { navigate } from "../lib/navigation";
import { Spinner } from "../components/ui";

/** 平台契约与 /api/system/health 一致（网页端驾驶舱同源） */
interface HealthItem {
  name: string;
  status: "OK" | "UNAVAILABLE" | "NOT_CONNECTED";
  detail: string;
}

interface CockpitData {
  health: { items: HealthItem[]; generatedAt?: string; build?: { version?: string; gitSha?: string } } | null;
  approval: { total: number; sample: { id: string; title: string; href: string; status: string; priority: string }[] } | null;
}

const STATUS_META: Record<HealthItem["status"], { label: string; tone: string }> = {
  OK: { label: "正常", tone: "text-good" },
  UNAVAILABLE: { label: "不可用", tone: "text-bad" },
  NOT_CONNECTED: { label: "未接入", tone: "text-warn" },
};

export default function AdminCockpitView() {
  const user = getCachedUser();
  const isAdmin = user?.role === "SUPER_ADMIN";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<CockpitData>({ health: null, approval: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    // 两接口并行；单项失败只降级对应分区，不让整页崩
    const errors: string[] = [];
    const [health, approval] = await Promise.all([
      api<CockpitData["health"]>("/api/system/health").catch((e: Error) => (errors.push(e.message), null)),
      api<{ items: { id: string; title: string; href: string; status: string; priority: string }[] }>("/api/system/tasks", { query: { view: "approval" } })
        .catch((e: Error) => (errors.push(e.message), null)),
    ]);
    if (errors.length >= 2) {
      setError("驾驶舱数据加载失败，请稍后重试");
    } else if (errors.length === 1) {
      setError("部分数据加载失败，下方仅展示成功加载的部分");
    }
    const approvalItems = approval?.items ?? [];
    setData({
      health,
      approval: approval ? { total: approvalItems.length, sample: approvalItems.slice(0, 5) } : null,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="rounded-2xl border border-line bg-panel p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 size-12 text-amber-500" />
          <p className="text-sm text-bad">无权访问驾驶舱</p>
          <p className="mt-2 text-xs text-faint">仅超级管理员可访问此功能</p>
        </div>
      </div>
    );
  }

  const healthItems = data.health?.items ?? [];
  const broken = healthItems.filter((item) => item.status === "UNAVAILABLE");
  const pendingApprovals = data.approval?.total ?? 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-7xl space-y-5">
          {/* 页面标题 */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-ink">系统驾驶舱</h1>
              <p className="mt-1 text-sm text-dim">
                数据来自 /api/system/health 与待我审批任务，仅展示状态，不提供控制动作
              </p>
            </div>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Spinner className="!h-4 !w-4" /> : <Activity size={16} />}
              刷新
            </button>
          </div>

          {error && (
            <div className="rounded-2xl border border-bad/40 bg-bad/5 p-4 text-sm text-bad">{error}</div>
          )}

          {loading ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-dim">加载中…</p>
            </div>
          ) : (
            <>
              {/* 概览卡：审批待办 + 服务异常数 */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10">
                      <ClipboardCheck size={20} className="text-brand" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-dim">待我审批</p>
                      <p className={`mt-0.5 text-2xl font-semibold ${pendingApprovals > 0 ? "text-warn" : "text-ink"}`}>
                        {pendingApprovals}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-faint">点击下方事项可跳转处理</p>
                </div>
                <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-bad/10">
                      <AlertTriangle size={20} className="text-bad" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-dim">不可用服务</p>
                      <p className={`mt-0.5 text-2xl font-semibold ${broken.length > 0 ? "text-bad" : "text-good"}`}>
                        {broken.length}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-faint">“未接入”为未放探测项，不代表故障</p>
                </div>
                <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-ok/10">
                      <ShieldCheck size={20} className="text-good" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-dim">检查项总数</p>
                      <p className="mt-0.5 text-2xl font-semibold text-ink">{healthItems.length}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-faint">来自 /api/system/health</p>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                {/* 系统健康只读状态 */}
                <section className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
                  <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink">
                    <Database size={20} className="text-brand" />
                    系统健康只读状态
                  </h2>
                  {healthItems.length === 0 ? (
                    <p className="py-6 text-center text-sm text-faint">健康数据未加载</p>
                  ) : (
                    <div className="space-y-2">
                      {healthItems.map((item) => {
                        const meta = STATUS_META[item.status] || STATUS_META.NOT_CONNECTED;
                        return (
                          <div key={item.name} className="flex items-center justify-between gap-4 rounded-xl bg-panel2/60 px-3.5 py-2.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-ink">{item.name}</p>
                              <p className="mt-0.5 truncate text-xs text-faint">{item.detail}</p>
                            </div>
                            <span className={`shrink-0 text-sm font-medium ${meta.tone}`}>{meta.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {data.health?.build?.version && (
                    <p className="mt-4 text-xs text-faint">
                      平台版本 {data.health.build.version}
                      {data.health.build.gitSha ? `· ${String(data.health.build.gitSha).slice(0, 10)}` : ""}
                    </p>
                  )}
                </section>

                {/* 待我审批事项 */}
                <section className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
                  <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink">
                    <Lock size={20} className="text-brand" />
                    待我审批（{pendingApprovals}）
                  </h2>
                  {data.approval === null ? (
                    <p className="py-6 text-center text-sm text-faint">审批数据未加载</p>
                  ) : data.approval.sample.length === 0 ? (
                    <p className="py-6 text-center text-sm text-dim">当前没有待审批事项</p>
                  ) : (
                    <div className="space-y-2">
                      {data.approval.sample.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => {
                            if (!navigate(task.href)) {
                              window.dachuan.openExternal(`${getServerUrl()}/tasks`);
                            }
                          }}
                          className="w-full rounded-xl border border-line bg-panel2/60 px-3.5 py-2.5 text-left transition-colors hover:border-brand/50 hover:bg-brand/5"
                        >
                          <p className="truncate text-sm font-medium text-ink">{task.title}</p>
                          <p className="mt-0.5 text-xs text-faint">{task.status} · {task.priority}</p>
                        </button>
                      ))}
                      {pendingApprovals > data.approval.sample.length && (
                        <button
                          onClick={() => navigate("/tasks")}
                          className="w-full rounded-xl px-3.5 py-2 text-center text-xs font-medium text-brand transition-colors hover:bg-brand/5"
                        >
                          还有 {pendingApprovals - data.approval.sample.length} 项，去“我的工作”处理
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
