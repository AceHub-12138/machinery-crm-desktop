import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { api, getServerUrl } from "../lib/api";
import { navigate } from "../lib/navigation";
import {
  formatTaskMonth,
  groupMonthlyTasks,
  MONTHLY_TASK_GROUP_LABELS,
  normalizeTaskMonth,
  shiftTaskMonth,
  type MonthlyTask,
  type MonthlyTaskGroup,
} from "../lib/monthly-tasks";
import { showToast } from "../components/ui";

function monthLabel(month: string) {
  const [year, value] = month.split("-");
  return `${year} 年 ${Number(value)} 月`;
}

function taskDate(item: MonthlyTask) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(item.dueAt || item.createdAt));
}

export default function MonthlyTasksView({ initialMonth, onBack }: { initialMonth?: string; onBack: () => void }) {
  const [month, setMonth] = useState(() => normalizeTaskMonth(initialMonth));
  const [items, setItems] = useState<MonthlyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ month: string; items: MonthlyTask[] }>("/api/system/tasks/monthly", { query: { month } });
      if (!Array.isArray(result.items)) throw new Error("月任务加载失败");
      setItems(result.items);
    } catch (loadError) {
      setItems([]);
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);
  const groups = useMemo(() => groupMonthlyTasks(items), [items]);

  const openTask = (item: MonthlyTask) => {
    if (navigate(item.href)) showToast("已跳转到对应业务模块", "success");
    else {
      showToast("该业务入口将在原平台打开", "info");
      void window.dachuan.openExternal(getServerUrl() + item.href);
    }
  };

  return <div className="flex flex-1 flex-col overflow-hidden">
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-3">
          <button className="text-sm text-dim hover:text-ink" onClick={onBack}>我的工作 / <span className="text-ink">月任务</span></button>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h1 className="text-2xl font-semibold text-ink">月任务</h1><p className="mt-1 text-sm text-dim">按计划日期或发起日期汇总当前可见事项。</p></div>
            <div className="inline-flex items-center rounded-xl border border-line bg-panel p-1">
              <button aria-label="上个月" className="rounded-lg p-2 text-dim hover:bg-panel2" onClick={() => setMonth((value) => shiftTaskMonth(value, -1))}><ChevronLeft size={16} /></button>
              <span className="min-w-28 px-3 text-center text-sm font-medium">{monthLabel(month)}</span>
              <button aria-label="下个月" className="rounded-lg p-2 text-dim hover:bg-panel2" onClick={() => setMonth((value) => shiftTaskMonth(value, 1))}><ChevronRight size={16} /></button>
            </div>
          </div>
        </header>

        {loading ? <div className="panel p-8 text-center text-sm text-dim">加载中...</div> : error ? <div className="panel p-8 text-center"><p className="text-sm text-bad">{error}</p><button className="btn-brand mt-4" onClick={() => void load()}>重试</button></div> : items.length === 0 ? <div className="panel p-8 text-center text-sm text-dim">本月暂无任务，切换月份查看其他时间范围。</div> : <div className="space-y-6">
          {(Object.keys(MONTHLY_TASK_GROUP_LABELS) as MonthlyTaskGroup[]).map((group) => groups[group].length > 0 && <section className="space-y-3" key={group}>
            <h2 className="text-sm font-semibold text-dim">{MONTHLY_TASK_GROUP_LABELS[group]} <span className="font-normal">{groups[group].length}</span></h2>
            <div className="grid gap-3 lg:grid-cols-2">{groups[group].map((item) => <button className="panel row-hover p-4 text-left" key={`${item.sourceType}:${item.sourceId}`} onClick={() => openTask(item)}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-medium text-ink">{item.title}</h3><p className="mt-2 text-sm text-dim">{item.module} · {item.taskType}</p></div><span className="rounded-full bg-panel2 px-2.5 py-1 text-xs text-dim">{item.priority}</span></div>
              <div className="mt-3 flex items-center justify-between text-sm text-dim"><span>{item.dateField === "dueAt" ? "计划日期" : "发起日期"}：{taskDate(item)}</span><ExternalLink size={14} /></div>
            </button>)}</div>
          </section>)}
        </div>}
      </div>
    </div>
  </div>;
}
