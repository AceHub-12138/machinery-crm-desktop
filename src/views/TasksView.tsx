import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Boxes,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Pin,
  ShieldCheck,
  CalendarDays,
} from "lucide-react";
import { api, getServerUrl } from "../lib/api";
import { navigate } from "../lib/navigation";
import { showToast } from "../components/ui";
import MonthlyTasksView from "./MonthlyTasksView";

const tabs = [
  ["inbox", "我的待办"],
  ["approval", "待我审批"],
  ["initiated", "我发起的"],
  ["handled", "已处理"],
] as const;

type TaskView = (typeof tabs)[number][0];
type TaskAction = "READ" | "PIN" | "IGNORE" | "UNIGNORE";

interface TaskItem {
  id: string;
  sourceType: string;
  sourceId: string;
  module: "CRM" | "ERP" | "SYSTEM";
  taskType: string;
  title: string;
  description?: string;
  status: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  initiatorId?: string;
  assigneeId?: string;
  dueAt?: string;
  createdAt: string;
  href: string;
  state?: {
    readAt?: string | null;
    pinnedAt?: string | null;
    ignoredAt?: string | null;
  };
}

const priorityClasses: Record<TaskItem["priority"], string> = {
  LOW: "bg-panel2 text-dim",
  NORMAL: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  HIGH: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  URGENT: "bg-bad/10 text-bad",
};

const moduleIcons = {
  CRM: ClipboardList,
  ERP: Boxes,
  SYSTEM: ShieldCheck,
};

function formatDate(value?: string) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isOverdue(task: TaskItem) {
  if (!task.dueAt || task.status !== "PENDING") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.dueAt) < today;
}

function initiatorLabel(task: TaskItem) {
  return task.initiatorId ? `用户 ID：${task.initiatorId}` : "系统";
}

function TaskCard({
  item,
  onSelect,
  selected,
}: {
  item: TaskItem;
  onSelect: () => void;
  selected: boolean;
}) {
  const ModuleIcon = moduleIcons[item.module];
  const unread = !item.state?.readAt;

  return (
    <button
      aria-pressed={selected}
      className={`w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        selected ? "rounded-2xl ring-2 ring-brand" : ""
      }`}
      onClick={onSelect}
      type="button"
    >
      <div
        className={`relative rounded-2xl border p-4 transition-all ${
          selected
            ? "border-brand/50 bg-brand/5"
            : "border-line bg-panel hover:border-line hover:bg-panel2"
        }`}
      >
        {item.state?.pinnedAt && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Pin className="size-3" aria-hidden="true" />
            置顶
          </span>
        )}
        <div className="flex min-w-0 items-start gap-3 pr-12">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-panel2 text-brand">
            <ModuleIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {unread && (
                <span
                  aria-label="未读"
                  className="size-2 shrink-0 rounded-full bg-bad"
                />
              )}
              <h2 className="min-w-0 font-medium text-ink">{item.title}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityClasses[item.priority]}`}
              >
                {item.priority}
              </span>
              <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-dim">
                {item.status}
              </span>
              {isOverdue(item) && (
                <span className="rounded-full bg-bad/10 px-2 py-0.5 text-xs font-medium text-bad">
                  已逾期
                </span>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-dim">
              {item.description || "待处理业务事项"}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
              <span>发起人：{initiatorLabel(item)}</span>
              {item.dueAt && <span>截止：{formatDate(item.dueAt)}</span>}
              <span>创建：{formatDate(item.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function TaskDetail({
  item,
  busy,
  onAction,
}: {
  item: TaskItem;
  busy: boolean;
  onAction: (action: TaskAction) => void;
}) {
  const ModuleIcon = moduleIcons[item.module];
  const actionButton =
    "rounded-xl border border-line bg-panel px-3 py-2 text-sm font-medium text-ink hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="h-fit rounded-2xl border border-line bg-panel p-5 md:sticky md:top-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-panel2 text-brand">
          <ModuleIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">{item.title}</h2>
          <p className="mt-1 text-sm text-dim">
            {item.description || "待处理业务事项"}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="rounded-full bg-panel2 px-2.5 py-1 text-xs text-dim">
          {item.status}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${priorityClasses[item.priority]}`}
        >
          {item.priority}
        </span>
        {isOverdue(item) && (
          <span className="rounded-full bg-bad/10 px-2.5 py-1 text-xs font-medium text-bad">
            已逾期
          </span>
        )}
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="text-faint">模块</dt>
          <dd className="mt-1 text-ink">{item.module}</dd>
        </div>
        <div>
          <dt className="text-faint">类型</dt>
          <dd className="mt-1 break-all text-ink">{item.taskType}</dd>
        </div>
        <div>
          <dt className="text-faint">发起人</dt>
          <dd className="mt-1 break-all text-ink">{initiatorLabel(item)}</dd>
        </div>
        {item.assigneeId && (
          <div>
            <dt className="text-faint">处理人 ID</dt>
            <dd className="mt-1 break-all text-ink">{item.assigneeId}</dd>
          </div>
        )}
        <div>
          <dt className="text-faint">截止时间</dt>
          <dd className="mt-1 text-ink">{formatDate(item.dueAt)}</dd>
        </div>
        <div>
          <dt className="text-faint">创建时间</dt>
          <dd className="mt-1 text-ink">{formatDate(item.createdAt)}</dd>
        </div>
      </dl>
              <a
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-brand transition-colors hover:text-brandhi"
                href={item.href || "#"}
                onClick={(e) => {
                  e.preventDefault();
                  // 平台 href（/customers/xxx、/shipments、/erp/* 等）映射为桌面视图；
                  // 桌面端暂无 ERP 模块的对象降级为提示并打开平台页面
                  if (navigate(item.href)) {
                    showToast("已跳转到对应业务模块", "success");
                  } else {
                    showToast("桌面端无法打开该业务入口，即将转到原平台", "info");
                    window.dachuan.openExternal(getServerUrl() + item.href);
                  }
                }}
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                查看业务入口
              </a>
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm font-medium text-ink">任务操作</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!item.state?.readAt && (
            <button
              className={actionButton}
              disabled={busy}
              onClick={() => onAction("READ")}
              type="button"
            >
              <CheckCircle2 className="mr-1 inline size-4" aria-hidden="true" />
              标记已读
            </button>
          )}
          {!item.state?.pinnedAt && (
            <button
              className={actionButton}
              disabled={busy}
              onClick={() => onAction("PIN")}
              type="button"
            >
              <Pin className="mr-1 inline size-4" aria-hidden="true" />
              置顶
            </button>
          )}
          {item.state?.ignoredAt ? (
            <button
              className={actionButton}
              disabled={busy}
              onClick={() => onAction("UNIGNORE")}
              type="button"
            >
              恢复
            </button>
          ) : (
            <button
              className={actionButton}
              disabled={busy}
              onClick={() => onAction("IGNORE")}
              type="button"
            >
              忽略
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TasksView({ initialMode = "list", initialMonth }: { initialMode?: "list" | "monthly"; initialMonth?: string }) {
  const [mode, setMode] = useState<"list" | "monthly">(initialMode);
  const [view, setView] = useState<TaskView>("inbox");
  const [items, setItems] = useState<TaskItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setMode(initialMode); }, [initialMode]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ items: TaskItem[] }>(
        `/api/system/tasks`,
        { query: { view } }
      );
      if (!Array.isArray(data.items)) {
        throw new Error("待办加载失败");
      }
      setItems(data.items);
      setSelectedId((current) =>
        data.items.some((item: TaskItem) => item.id === current)
          ? current
          : data.items[0]?.id
      );
    } catch (loadError) {
      setItems([]);
      setSelectedId(undefined);
      setError(
        loadError instanceof Error ? loadError.message : "待办加载失败"
      );
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const changeView = (nextView: TaskView) => {
    setStatusFilter("ALL");
    setView(nextView);
  };

  const visibleItems = useMemo(
    () =>
      statusFilter === "ALL"
        ? items
        : items.filter((item) => item.status === statusFilter),
    [items, statusFilter]
  );
  const selected = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0];
  const statuses = useMemo(
    () => [...new Set(items.map((item) => item.status))],
    [items]
  );

  const updateTask = async (action: TaskAction) => {
    if (!selected) return;
    setBusy(true);
    try {
      await api("/api/system/tasks", {
        method: "PATCH",
        body: {
          sourceType: selected.sourceType,
          sourceId: selected.sourceId,
          action,
        },
      });
      await loadTasks();
      showToast("操作成功", "success");
    } catch (updateError) {
      showToast(
        updateError instanceof Error
          ? updateError.message
          : "待办状态更新失败，请重试。",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  if (mode === "monthly") return <MonthlyTasksView initialMonth={initialMonth} onBack={() => setMode("list")} />;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-7xl space-y-5">
          {/* 页面标题 */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">
                我的工作
              </h1>
              <p className="mt-1 text-sm text-dim">
                统一查看待办与审批，原有业务状态机保持不变
              </p>
            </div>
            <button className="btn-ghost" onClick={() => setMode("monthly")}><CalendarDays size={15} />月任务视图</button>
          </div>

          {/* 筛选栏 */}
          <div className="rounded-2xl border border-line bg-panel p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="md:hidden">
                <select
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
                  value={view}
                  onChange={(e) => changeView(e.target.value as TaskView)}
                >
                  {tabs.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-dim">
                状态
                <select
                  className="rounded-xl border border-line bg-surface px-2 py-1 text-ink"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">全部</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* 内容区 */}
          {loading ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-dim">加载中...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-bad">{error}</p>
              <button
                onClick={loadTasks}
                className="mx-auto mt-4 block rounded-xl bg-brand px-4 py-2 text-sm text-white transition-colors hover:bg-brandhi"
              >
                重试
              </button>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-dim">
                当前视图和状态筛选下没有可见事项。
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              {/* 左侧视图切换 */}
              <aside className="hidden md:block">
                <div className="rounded-2xl border border-line bg-panel p-3">
                  <p className="px-2 pb-2 text-sm font-medium text-ink">
                    任务视图
                  </p>
                  <div aria-label="任务视图" className="space-y-1" role="tablist">
                    {tabs.map(([key, label]) => (
                      <button
                        aria-selected={view === key}
                        className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${
                          view === key
                            ? "bg-panel2 text-ink"
                            : "text-dim hover:bg-panel2/50 hover:text-ink"
                        }`}
                        key={key}
                        onClick={() => changeView(key)}
                        role="tab"
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 px-2 text-sm text-faint">
                    共 {visibleItems.length} 项
                  </p>
                </div>
              </aside>

              {/* 中间任务列表 */}
              <section aria-label="任务列表" className="space-y-3">
                {visibleItems.map((item) => (
                  <div key={item.id} className="space-y-3">
                    <TaskCard
                      item={item}
                      onSelect={() => setSelectedId(item.id)}
                      selected={selected?.id === item.id}
                    />
                    {selected?.id === item.id && (
                      <div className="md:hidden">
                        <TaskDetail
                          busy={busy}
                          item={item}
                          onAction={(action) => void updateTask(action)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </section>

              {/* 右侧详情 */}
              <aside aria-label="任务详情" className="hidden md:block">
                {selected && (
                  <TaskDetail
                    busy={busy}
                    item={selected}
                    onAction={(action) => void updateTask(action)}
                  />
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
