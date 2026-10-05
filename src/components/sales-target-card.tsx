import { useCallback, useEffect, useState } from "react";
import { Settings2, Target, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { dateTime } from "../lib/format";
import { Spinner, ErrorTip, Sheet, notify } from "./ui";
import { Ring } from "./fx";
import {
  SALES_TARGET_COMPANY_SCOPE,
  SALES_TARGET_METRIC_OPTIONS,
  SALES_TARGET_PERIOD_OPTIONS,
  buildSalesTargetPayload,
  formatSalesTargetMoney,
  pickSalesTarget,
  salesTargetActualLabel,
  salesTargetEmptyText,
  salesTargetRate,
  salesTargetVisual,
  salesTargetYears,
  type SalesTargetItem,
  type SalesTargetMetric,
  type SalesTargetPeriodType,
  type SalesTargetResponse,
} from "../lib/sales-target";

interface SalesUserOption {
  id: string;
  name: string;
}

const YEAR_OPTIONS_NOW = new Date().getFullYear();

/**
 * 销售目标达成率卡片：对齐平台 components/dashboard/sales-target-card.tsx。
 * 目标数据来自独立端点 /api/crm/sales-targets（工作台 /api/dashboard 不含目标字段）。
 * 普通销售只能看自己的目标；"设置目标"仅 SUPER_ADMIN 可见。
 */
export function SalesTargetCard({
  salesUsers = [],
  currentUserId,
  isSuperAdmin = false,
  delay = 0,
}: {
  salesUsers?: SalesUserOption[];
  currentUserId?: string | null;
  isSuperAdmin?: boolean;
  delay?: number;
}) {
  const now = new Date();
  const [periodType, setPeriodType] = useState<SalesTargetPeriodType>("MONTH");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [metric, setMetric] = useState<SalesTargetMetric>("CONTRACT_AMOUNT");
  const [scopeUserId, setScopeUserId] = useState(isSuperAdmin ? SALES_TARGET_COMPANY_SCOPE : currentUserId || "");
  const [data, setData] = useState<SalesTargetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<SalesTargetResponse>("/api/crm/sales-targets", {
        query: {
          periodType,
          year: String(year),
          month: periodType === "MONTH" ? String(month) : undefined,
          metric,
        },
      });
      setData(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [periodType, year, month, metric]);

  useEffect(() => {
    load();
  }, [load]);

  const effectiveScope = isSuperAdmin ? scopeUserId : currentUserId || scopeUserId;
  const selected = pickSalesTarget(data?.targets, { isSuperAdmin, scopeUserId: effectiveScope, currentUserId });
  // 有记录但平台没算出完成值 → 视为还没配置目标
  const configured = Boolean(selected && selected.actualAmount !== null && selected.actualAmount !== undefined);

  const scopeName =
    (salesUsers.find((u) => u.id === selected?.salesUserId)?.name) ||
    (selected?.salesUserId ? "指定销售" : "全公司");

  return (
    <div className="panel fade-up flex flex-col" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brandhi to-brand" />
          <Target size={14} className="text-brand" /> 销售目标达成率
          {data?.period?.label && <span className="truncate text-xs text-faint">· {data.period.label}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isSuperAdmin && (
            <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setDialogOpen(true)}>
              <Settings2 size={13} /> 设置目标
            </button>
          )}
          <button className="btn-ghost !px-2 !py-1.5" title="刷新" onClick={load}>
            {loading ? <Spinner className="!h-4 !w-4" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {/* 周期 / 指标 / 范围切换：口径与平台一致 */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
        <select
          className="input !w-auto !py-1.5"
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as SalesTargetPeriodType)}
          aria-label="周期类型"
        >
          {SALES_TARGET_PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          className="input !w-auto !py-1.5"
          value={metric}
          onChange={(e) => setMetric(e.target.value as SalesTargetMetric)}
          aria-label="指标"
        >
          {SALES_TARGET_METRIC_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select className="input !w-auto !py-1.5" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="年份">
          {salesTargetYears(YEAR_OPTIONS_NOW).map((y) => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        {periodType === "MONTH" && (
          <select className="input !w-auto !py-1.5" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="月份">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
        )}
        {isSuperAdmin && (
          <select className="input !w-auto !py-1.5" value={scopeUserId} onChange={(e) => setScopeUserId(e.target.value)} aria-label="目标范围">
            <option value={SALES_TARGET_COMPANY_SCOPE}>全公司</option>
            {salesUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-5 px-4 pb-3.5">
        {error ? (
          <div className="w-full">
            <ErrorTip message={`销售目标暂时无法加载：${error}`} onRetry={load} />
          </div>
        ) : loading && !data ? (
          <div className="flex w-full justify-center py-8">
            <Spinner />
          </div>
        ) : !configured ? (
          <div className="flex w-full flex-col items-center gap-2 py-5">
            <Ring pct={0} size={132} stroke={11} />
            <span className="text-sm text-dim">待设置</span>
            <span className="text-xs text-faint">{salesTargetEmptyText(periodType)}</span>
          </div>
        ) : (
          <>
            <Ring
              pct={salesTargetVisual(selected!.visualRate)}
              size={132}
              stroke={11}
              label="已完成"
              sub={formatSalesTargetMoney(selected!.actualAmount)}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="label">完成率</span>
                <span className="mono truncate text-lg font-semibold text-brandhi">
                  {salesTargetRate(selected!.completionRate).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="label">{salesTargetActualLabel(metric)}</span>
                <span className="mono truncate text-sm text-ink">{formatSalesTargetMoney(selected!.actualAmount)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="label">目标金额</span>
                <span className="mono truncate text-sm text-ink">{formatSalesTargetMoney(selected!.targetAmount ?? selected!.amount)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="label">{selected!.exceeded ? "超额金额" : "距离目标"}</span>
                <span className={`mono truncate text-sm ${selected!.exceeded ? "text-ok" : "text-warn"}`}>
                  {formatSalesTargetMoney(selected!.exceeded ? selected!.exceededAmount : selected!.remainingAmount)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
                <span>范围：{scopeName}</span>
                <span>最后更新：{dateTime(selected!.updatedAt)}</span>
                {selected!.exceeded && <span className="text-ok">超额完成</span>}
              </div>
            </div>
          </>
        )}
      </div>

      {dialogOpen && (
        <SalesTargetDialog
          salesUsers={salesUsers}
          defaultPeriodType={periodType}
          defaultYear={year}
          defaultMonth={month}
          defaultMetric={metric}
          defaultScope={scopeUserId}
          onClose={() => setDialogOpen(false)}
          onSaved={(saved) => {
            setDialogOpen(false);
            // 保存后主卡片跟着切到刚设置的范围，用户能立刻看到结果
            setPeriodType(saved.periodType);
            setYear(saved.periodYear);
            if (saved.periodType === "MONTH") setMonth(saved.periodIndex || month);
            setMetric(saved.metric);
            setScopeUserId(saved.salesUserId || SALES_TARGET_COMPANY_SCOPE);
            notify("销售目标已保存");
          }}
        />
      )}
    </div>
  );
}

function SalesTargetDialog({
  salesUsers,
  defaultPeriodType,
  defaultYear,
  defaultMonth,
  defaultMetric,
  defaultScope,
  onClose,
  onSaved,
}: {
  salesUsers: SalesUserOption[];
  defaultPeriodType: SalesTargetPeriodType;
  defaultYear: number;
  defaultMonth: number;
  defaultMetric: SalesTargetMetric;
  defaultScope: string;
  onClose: () => void;
  onSaved: (saved: { periodType: SalesTargetPeriodType; periodYear: number; periodIndex: number; metric: SalesTargetMetric; salesUserId: string | null }) => void;
}) {
  const [periodType, setPeriodType] = useState<SalesTargetPeriodType>(defaultPeriodType);
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [metric, setMetric] = useState<SalesTargetMetric>(defaultMetric);
  const [scope, setScope] = useState(defaultScope);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErr("");
    let body;
    try {
      body = buildSalesTargetPayload({ periodType, year, month, metric, scopeUserId: scope, amount, note });
    } catch (validationError) {
      setErr((validationError as Error).message);
      return;
    }
    setSaving(true);
    try {
      await api("/api/crm/sales-targets", { method: "POST", body });
      onSaved({ periodType: body.periodType, periodYear: body.periodYear, periodIndex: body.periodIndex, metric: body.metric, salesUserId: body.salesUserId });
    } catch (saveError) {
      setErr((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title="设置销售目标" subtitle="同一周期 + 指标 + 范围只保留一条目标，重复保存即覆盖" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {err && <div className="text-xs text-bad">{err}</div>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="label">周期类型</span>
            <select className="input" value={periodType} onChange={(e) => setPeriodType(e.target.value as SalesTargetPeriodType)}>
              {SALES_TARGET_PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">指标</span>
            <select className="input" value={metric} onChange={(e) => setMetric(e.target.value as SalesTargetMetric)}>
              {SALES_TARGET_METRIC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.value === "PAID_AMOUNT" ? "回款金额" : "合同金额"}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">年份</span>
            <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {salesTargetYears(new Date().getFullYear()).map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
          </label>
          {periodType === "MONTH" ? (
            <label className="flex flex-col gap-1.5">
              <span className="label">月份</span>
              <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
            </label>
          ) : (
            <div />
          )}
          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="label">目标范围</span>
            <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value={SALES_TARGET_COMPANY_SCOPE}>全公司</option>
              {salesUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="label">目标金额 *</span>
            <input
              className="input mono"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例如 1000000.00"
              inputMode="decimal"
            />
          </label>
          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="label">备注（可选）</span>
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="目标说明" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button className="btn-brand" disabled={saving}>
            {saving ? <Spinner className="!h-4 !w-4" /> : "保存目标"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
