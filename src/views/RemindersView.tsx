import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { groupFollowUpCustomers, overdueDays, type FollowUpCustomer } from "../lib/reminders";
import { navigate } from "../lib/navigation";
import { showToast } from "../components/ui";

/** 工作台「今日待跟进 / 逾期未跟进」卡片点进来时定位到对应分组 */
const GROUP_IDS = { today: "reminders-today", upcoming: "reminders-upcoming", overdue: "reminders-overdue" } as const;
type ReminderGroup = keyof typeof GROUP_IDS;

function isReminderGroup(value?: string): value is ReminderGroup {
  return value === "today" || value === "upcoming" || value === "overdue";
}

export default function RemindersView({ initialGroup }: { initialGroup?: string }) {
  const [raw, setRaw] = useState<FollowUpCustomer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const scrolledRef = useRef(false);

  const group: ReminderGroup | null = isReminderGroup(initialGroup) ? initialGroup : null;

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await api<{ followUpCustomers?: FollowUpCustomer[] }>("/api/dashboard");
      // 防御：仅接受数组契约（平台 service.ts findMany 客户数组）；异常形状按空处理并提示
      const value = result?.followUpCustomers;
      if (!Array.isArray(value)) {
        setRaw([]);
        showToast("跟进数据格式异常，已按空列表处理", "error");
      } else {
        setRaw(value);
      }
    } catch (error) {
      setRaw([]);
      showToast(
        error instanceof Error ? error.message : "加载提醒数据失败",
        "error"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const { today: todayList, upcoming: upcomingList, overdue: overdueList } = useMemo(
    () => groupFollowUpCustomers(raw || []),
    [raw]
  );

  // 数据到位后把目标分组滚进视野（只做一次，避免刷新后把用户又拽回去）
  useEffect(() => {
    if (!group || loading || scrolledRef.current) return;
    scrolledRef.current = true;
    const target = document.getElementById(GROUP_IDS[group]);
    if (target) target.scrollIntoView({ block: "start" });
  }, [group, loading]);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="text-sm text-dim">加载中...</div>
      </div>
    );
  }

  const todayCount = todayList.length;
  const upcomingCount = upcomingList.length;
  const overdueCount = overdueList.length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">
          {/* 页面标题 */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-ink">跟进提醒</h1>
              <p className="mt-1 text-sm text-dim">
                今日待跟进、即将到期和逾期未跟进的客户列表
              </p>
            </div>
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              刷新
            </button>
          </div>

          {/* 统计卡片 */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-brand/10">
                  <Calendar size={24} className="text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-dim">今日待跟进</p>
                  <p className="mt-1 text-3xl font-semibold text-ink">
                    {todayCount}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-warn/10">
                  <Calendar size={24} className="text-warn" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-dim">7 天内到期</p>
                  <p className="mt-1 text-3xl font-semibold text-ink">
                    {upcomingCount}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-bad/10">
                  <AlertCircle size={24} className="text-bad" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-dim">逾期未跟进</p>
                  <p className="mt-1 text-3xl font-semibold text-bad">
                    {overdueCount}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 今日待跟进列表 */}
          <section id={GROUP_IDS.today} className={`space-y-3 scroll-mt-4 ${group === "today" ? "rounded-2xl ring-2 ring-brand/40 p-1" : ""}`}>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">
                今日待跟进 ({todayCount})
              </h2>
            </div>
            {todayList.length === 0 ? (
              <div className="rounded-2xl border border-line bg-panel p-8 text-center">
                <p className="text-sm text-dim">今日暂无待跟进客户</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todayList.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => navigate(`/customers/${customer.id}`)}
                    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-panel p-4 text-left transition-all hover:border-brand/50 hover:bg-brand/5 hover:shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{customer.companyName}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-dim">
                        {customer.contactName && <span>{customer.contactName}</span>}
                        {customer.assignedUser?.name && (
                          <span>负责人:{customer.assignedUser.name}</span>
                        )}
                      </div>
                      {customer.nextFollowDate && (
                        <p className="mt-1 text-xs text-faint">
                          计划跟进：{formatDate(customer.nextFollowDate)}
                        </p>
                      )}
                    </div>
                    <ExternalLink size={16} className="shrink-0 text-faint" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 7 天内到期 */}
          <section id={GROUP_IDS.upcoming} className={`space-y-3 scroll-mt-4 ${group === "upcoming" ? "rounded-2xl ring-2 ring-brand/40 p-1" : ""}`}>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">
                7 天内到期 ({upcomingCount})
              </h2>
            </div>
            {upcomingList.length === 0 ? (
              <div className="rounded-2xl border border-line bg-panel p-8 text-center">
                <p className="text-sm text-dim">近 7 天暂无跟进计划</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingList.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => navigate(`/customers/${customer.id}`)}
                    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-panel p-4 text-left transition-all hover:border-brand/50 hover:bg-brand/5 hover:shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{customer.companyName}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-dim">
                        {customer.contactName && <span>{customer.contactName}</span>}
                        {customer.assignedUser?.name && (
                          <span>负责人:{customer.assignedUser.name}</span>
                        )}
                      </div>
                      {customer.nextFollowDate && (
                        <p className="mt-1 text-xs text-faint">
                          计划跟进：{formatDate(customer.nextFollowDate)}
                        </p>
                      )}
                    </div>
                    <ExternalLink size={16} className="shrink-0 text-faint" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 逾期未跟进列表 */}
          <section id={GROUP_IDS.overdue} className={`space-y-3 scroll-mt-4 ${group === "overdue" ? "rounded-2xl ring-2 ring-bad/40 p-1" : ""}`}>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">
                逾期未跟进 ({overdueCount})
              </h2>
            </div>
            {overdueList.length === 0 ? (
              <div className="rounded-2xl border border-line bg-panel p-8 text-center">
                <p className="text-sm text-dim">暂无逾期客户</p>
              </div>
            ) : (
              <div className="space-y-2">
                {overdueList.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => navigate(`/customers/${customer.id}`)}
                    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-bad/30 bg-bad/5 p-4 text-left transition-all hover:border-bad/50 hover:bg-bad/10 hover:shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink">{customer.companyName}</p>
                        <span className="rounded-full bg-bad/10 px-2 py-0.5 text-xs font-medium text-bad">
                          逾期 {overdueDays(customer.nextFollowDate)} 天
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-dim">
                        {customer.contactName && <span>{customer.contactName}</span>}
                        {customer.assignedUser?.name && (
                          <span>负责人:{customer.assignedUser.name}</span>
                        )}
                      </div>
                      {customer.nextFollowDate && (
                        <p className="mt-1 text-xs text-bad">
                          原定跟进：{formatDate(customer.nextFollowDate)}
                        </p>
                      )}
                    </div>
                    <ExternalLink size={16} className="shrink-0 text-faint" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
