import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, CheckCircle2, XCircle, MinusCircle, ShieldCheck } from "lucide-react";
import { api, getCachedUser } from "../lib/api";
import { Spinner } from "../components/ui";

/** 平台契约：GET /api/system/health（status 枚举与网页端健康检查页一致） */
interface HealthItem {
  name: string;
  status: "OK" | "UNAVAILABLE" | "NOT_CONNECTED";
  detail: string;
}

interface HealthReport {
  items: HealthItem[];
  generatedAt?: string;
  build?: {
    version?: string;
    gitSha?: string;
    branch?: string;
  };
}

const STATUS_META: Record<HealthItem["status"], { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  OK: { label: "正常", tone: "text-good", icon: CheckCircle2 },
  UNAVAILABLE: { label: "不可用", tone: "text-bad", icon: XCircle },
  NOT_CONNECTED: { label: "未接入", tone: "text-warn", icon: MinusCircle },
};

function formatTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(d);
}

export default function AdminHealthView() {
  const user = getCachedUser();
  const isAdmin = user?.role === "SUPER_ADMIN";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<HealthReport | null>(null);

  const loadHealth = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const data = await api<HealthReport>("/api/system/health");
      if (!data || !Array.isArray(data.items)) throw new Error("健康数据格式异常");
      setReport(data);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "健康检查失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void loadHealth();
  }, [isAdmin, loadHealth]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="rounded-2xl border border-line bg-panel p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 size-12 text-amber-500" />
          <p className="text-sm text-bad">无权访问健康检查</p>
          <p className="mt-2 text-xs text-faint">仅超级管理员可访问此功能</p>
        </div>
      </div>
    );
  }

  const items = report?.items ?? [];
  const broken = items.filter((item) => item.status === "UNAVAILABLE");
  const allOk = items.length > 0 && broken.length === 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-4xl space-y-5">
          {/* 页面标题 */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-ink">健康检查</h1>
              <p className="mt-1 text-sm text-dim">
                来自平台 /api/system/health 的只读状态，不做任何控制动作
              </p>
            </div>
            <button
              onClick={() => void loadHealth(true)}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading || refreshing ? "animate-spin" : ""} />
              刷新
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-dim">检查中…</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-bad">{error}</p>
              <button onClick={() => void loadHealth()} className="mx-auto mt-4 block rounded-xl bg-brand px-4 py-2 text-sm text-white">
                重试
              </button>
            </div>
          ) : (
            <>
              {/* 总体状态 */}
              <div
                className={`rounded-2xl border p-6 shadow-sm ${
                  allOk
                    ? "border-good/30 bg-good/5"
                    : broken.length === 0
                      ? "border-line bg-panel"
                      : "border-bad/30 bg-bad/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  {allOk ? (
                    <CheckCircle2 size={32} className="text-good" />
                  ) : broken.length === 0 ? (
                    <ShieldCheck size={32} className="text-warn" />
                  ) : (
                    <AlertTriangle size={32} className="text-bad" />
                  )}
                  <div>
                    <h2 className="text-lg font-semibold text-ink">
                      {allOk ? "可验证项全部正常" : broken.length > 0 ? "部分服务不可用" : "各项均为只读探测状态"}
                    </h2>
                    <p className="text-sm text-dim">
                      {allOk
                        ? "可探测的服务健康运行；未接入探测的项目见下方列表"
                        : "请注意标记为不可用的服务，未接入项不代表故障"}
                    </p>
                  </div>
                </div>
              </div>

              {/* 检查项列表 */}
              <div className="space-y-2">
                {items.map((item) => {
                  const meta = STATUS_META[item.status] || STATUS_META.NOT_CONNECTED;
                  const Icon = meta.icon;
                  return (
                    <div key={item.name} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-panel p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Icon size={18} className={`shrink-0 ${meta.tone}`} aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">{item.name}</p>
                          <p className="mt-0.5 truncate text-xs text-faint">{item.detail}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 text-sm font-medium ${meta.tone}`}>{meta.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* 生成时间与构建信息 */}
              <div className="rounded-2xl border border-line bg-panel p-5">
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-faint">检查生成时间</dt>
                    <dd className="mt-1 text-ink">{formatTime(report?.generatedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">平台构建版本</dt>
                    <dd className="mt-1 break-all text-ink">
                      {report?.build?.version || "-"}
                      {report?.build?.gitSha ? `（${String(report.build.gitSha).slice(0, 10)}）` : ""}
                    </dd>
                  </div>
                </dl>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
