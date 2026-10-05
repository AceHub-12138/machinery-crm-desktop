import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ClipboardList, CalendarClock, Wrench, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { getCachedUser } from "../lib/api";
import { moneyShort, moneyFull, money, date, relativeTime, FOLLOW_TYPE, label, pillTone, AFTER_SALES_STATUS, AFTER_SALES_TYPE, URGENCY, PROVINCE_OPTIONS } from "../lib/format";
import { Spinner, Empty, ErrorTip, Pill, PageHeader, Segmented } from "../components/ui";
import { CountUp, Ring } from "../components/fx";
import { SalesTargetCard } from "../components/sales-target-card";
import { navigate } from "../lib/navigation";
import {
  AFTER_SALES_REMINDER_HREFS,
  SHIPMENT_REMINDER_HREFS,
  dashboardKpiHrefs,
  resolveDashboardRange,
} from "../lib/dashboard-kpi";

const PRESETS = [
  { value: "today", label: "今日" },
  { value: "yesterday", label: "昨日" },
  { value: "7d", label: "近 7 天" },
  { value: "month", label: "本月" },
  { value: "lastMonth", label: "上月" },
  { value: "quarter", label: "本季度" },
  { value: "year", label: "全年" },
  { value: "custom", label: "自定义" },
];

/* 维度筛选项与平台 dashboard/page.tsx 完全一致 */
const CUSTOMER_STATUS_OPTIONS = [
  { value: "", label: "全部客户" },
  { value: "NEW_LEAD", label: "新线索" },
  { value: "QUOTED", label: "已报价" },
  { value: "WON", label: "已成交" },
  { value: "INACTIVE", label: "暂停跟进" },
  { value: "LOST", label: "流失客户" },
];

const CONTRACT_STATUS_OPTIONS = [
  { value: "", label: "全部合同" },
  { value: "DRAFT", label: "草稿" },
  { value: "SIGNED", label: "已确认" },
  { value: "PRODUCTION", label: "生产中" },
  { value: "SHIPPED", label: "已发货" },
  { value: "COMPLETED", label: "已完成" },
  { value: "ARCHIVED", label: "已归档" },
  { value: "CANCELLED", label: "已取消" },
];

const SHIPMENT_STATUS_OPTIONS = [
  { value: "", label: "全部发货" },
  { value: "NOT_SHIPPED", label: "待发货" },
  { value: "SHIPPED", label: "已发货" },
  { value: "OVERDUE", label: "逾期未发货" },
];

/* 售后三组提醒：标题、顺序、色调与平台 AfterSalesReminder 一致 */
const AFTER_SALES_GROUPS = [
  { key: "inProgress", label: "进行中", tone: "text-brandhi bg-brand/10" },
  { key: "overdue", label: "超时未回执", tone: "text-bad bg-bad/10" },
  { key: "completedUnclosed", label: "已完成未闭环", tone: "text-warn bg-warn/10" },
] as const;

interface DueContract {
  id: string;
  contractNo: string;
  estimatedShipmentDate: string;
  equipmentName: string;
  equipmentModel: string;
  customer: { companyName: string };
}
interface RecentFollow {
  id: string;
  content: string;
  followType: string;
  createdAt: string;
  customer: { companyName: string };
  user: { name: string };
}
interface FollowUpCustomer {
  id: string;
  companyName: string;
  contactName: string;
  nextFollowDate: string;
  assignedUser?: { name: string };
}
interface AfterSalesBrief {
  id: string;
  orderNo: string;
  customerNameSnapshot: string;
  equipmentModelSnapshot: string;
  orderType: string;
  urgency: string;
  status: string;
  dispatchDate: string;
}
interface SalesUserBrief {
  id: string;
  name: string;
}

interface DashboardData {
  /** 服务端回传的统计区间（KPI 跳转要用同一口径，桌面端不自己解释周期） */
  range?: { preset?: string; start?: string; end?: string; startDate?: string; endDate?: string };
  salesUsers?: SalesUserBrief[];
  stats: {
    totalCustomers: number;
    todayFollowUp: number;
    overdueFollowUp: number;
    sevenDayFollowUp: number;
    periodNewCustomers: number;
    periodNewContracts: number;
    periodContractAmount: number;
    periodPaidAmount: number;
    periodUnpaidAmount: number;
    periodShipments: number;
    totalContractAmount: number;
    totalPaidAmount: number;
    totalUnpaidAmount: number;
    unpaidContracts: number;
    partialPaidContracts: number;
    todayShipmentDue: number;
    sevenDayShipmentDue: number;
    overdueShipmentDue: number;
  };
  shipmentReminders: { today: DueContract[]; sevenDays: DueContract[]; overdue: DueContract[] };
  afterSalesReminders: {
    inProgress: AfterSalesBrief[];
    overdue: AfterSalesBrief[];
    completedUnclosed: AfterSalesBrief[];
  };
  recentFollows: RecentFollow[];
  followUpCustomers: FollowUpCustomer[];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "凌晨好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function cnDate() {
  const d = new Date();
  const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${week}`;
}

/** 本地日期 → yyyy-MM-dd（自定义区间参数，避免 UTC 偏移串天） */
function toDateInput(d: Date) {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * KPI 磁贴。给了 href 就整块可点，跳到已按同一周期/维度筛好的目标模块
 * （href 由 dashboardKpiHrefs 生成，与平台 KPI 联动口径一致）。
 */
function Tile({
  label,
  value,
  format,
  sub,
  glow = "",
  delay = 0,
  href,
  title,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  sub?: React.ReactNode;
  glow?: string;
  delay?: number;
  href?: string;
  title?: string;
}) {
  const className = `kpi-tile panel panel-hover fade-up flex w-full flex-col gap-1 px-4 py-3.5 text-left ${href ? "cursor-pointer" : ""}`;
  const body = (
    <>
      <span className="label flex items-center gap-1">
        {label}
        {href && <ArrowRight size={11} className="shrink-0 text-brand opacity-60" />}
      </span>
      <span className={`mono text-[22px] font-semibold leading-tight whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${glow}`}>
        <CountUp value={value} format={format} />
      </span>
      {sub !== undefined && <span className="text-xs text-faint">{sub}</span>}
    </>
  );
  if (href) {
    return (
      <button
        type="button"
        className={className}
        style={{ animationDelay: `${delay}ms` }}
        title={title || `查看${label}明细`}
        onClick={() => navigate(href)}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={className} style={{ animationDelay: `${delay}ms` }}>
      {body}
    </div>
  );
}

/**
 * 售后提醒卡片：角标 = 列表长度（同源，平台这三组数组不截断），
 * 列表固定高内部滚动 + 「查看全部 →」，条数多时不会出现"角标 9 只见 6 条却没入口"。
 */
function AfterSalesCard({
  title,
  tone,
  items,
  href,
  delay = 0,
}: {
  title: string;
  tone: string;
  items: AfterSalesBrief[];
  href: string;
  delay?: number;
}) {
  return (
    <div className="panel fade-up flex h-[320px] flex-col" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brandhi to-brand" />
          <Wrench size={14} className="text-brand" /> 售后 · {title}
        </div>
        <span className={`mono shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <Empty text="暂无记录" />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-1">
          {items.map((o) => (
            <button
              type="button"
              key={o.id}
              className="row-hover flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left"
              title={`查看工单 ${o.orderNo}`}
              onClick={() => navigate(`/after-sales/${o.id}`)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{o.customerNameSnapshot}</div>
                <div className="mono mt-0.5 text-xs text-faint">
                  {o.orderNo} · {label(AFTER_SALES_TYPE, o.orderType)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {o.urgency === "URGENT" && (
                  <Pill tone={pillTone(URGENCY, o.urgency)}>{label(URGENCY, o.urgency)}</Pill>
                )}
                <Pill tone={pillTone(AFTER_SALES_STATUS, o.status)}>{label(AFTER_SALES_STATUS, o.status)}</Pill>
              </div>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="mt-auto px-4 pb-3 pt-1 text-right text-xs font-medium text-brandhi hover:underline"
        onClick={() => navigate(href)}
      >
        查看全部 →
      </button>
    </div>
  );
}

export default function DashboardView() {
  const [preset, setPreset] = useState("month");
  const [customStart, setCustomStart] = useState(() => toDateInput(new Date()));
  const [customEnd, setCustomEnd] = useState(() => toDateInput(new Date()));
  const [province, setProvince] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [customerStatus, setCustomerStatus] = useState("");
  const [contractStatus, setContractStatus] = useState("");
  const [shipmentStatus, setShipmentStatus] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reminderTab, setReminderTab] = useState<"today" | "sevenDays" | "overdue">("today");
  const user = getCachedUser();
  // 销售目标读取权限与平台 canAccessCrmDashboard 一致（ERP 岗位本就进不了工作台，这里再兜一层）
  const salesTargetReadable = user?.role === "SUPER_ADMIN" || user?.role === "SALES" || user?.role === "FOREIGN_TRADE";

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError("");
      try {
        const res = await api<DashboardData>("/api/dashboard", {
          // cleanQuery 会丢弃空值，只发送用户实际设置的条件
          query: {
            preset,
            start: preset === "custom" ? customStart || undefined : undefined,
            end: preset === "custom" ? customEnd || undefined : undefined,
            province: province || undefined,
            salesUserId: salesUserId || undefined,
            customerStatus: customerStatus || undefined,
            contractStatus: contractStatus || undefined,
            shipmentStatus: shipmentStatus || undefined,
          },
        });
        setData(res);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [preset, customStart, customEnd, province, salesUserId, customerStatus, contractStatus, shipmentStatus],
  );

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats;
  const reminders = data?.shipmentReminders;
  const reminderList = reminders ? reminders[reminderTab] : [];
  const afterSales = data?.afterSalesReminders;
  const afterSalesHasItems =
    !!afterSales && AFTER_SALES_GROUPS.some((g) => (afterSales[g.key]?.length ?? 0) > 0);
  /**
   * KPI 跳转链接：区间优先用服务端回传的 range（与卡片数字同一口径），
   * 维度用当前筛选；业务员走 kpiSalesUserId，避免落进目标页时覆盖用户手选。
   */
  const kpiRange = resolveDashboardRange(preset, customStart, customEnd, data?.range);
  const kpiHrefs = dashboardKpiHrefs(kpiRange, {
    province: province || undefined,
    salesUserId: salesUserId || undefined,
    customerStatus: customerStatus || undefined,
    contractStatus: contractStatus || undefined,
    shipmentStatus: shipmentStatus || undefined,
  });
  // 发货提醒角标来自服务端完整 count，列表被服务端 take:8 截断，
  // 差出来的条数用「查看全部 →」兜住，别让用户以为只有 8 条。
  const reminderCount = stats
    ? reminderTab === "today"
      ? stats.todayShipmentDue
      : reminderTab === "sevenDays"
        ? stats.sevenDayShipmentDue
        : stats.overdueShipmentDue
    : 0;
  const reminderHidden = Math.max(0, (reminderCount || 0) - reminderList.length);
  const clearDimensionFilters = () => {
    setProvince("");
    setSalesUserId("");
    setCustomerStatus("");
    setContractStatus("");
    setShipmentStatus("");
  };
  const paidRate =
    stats && Number(stats.totalContractAmount) > 0
      ? Math.round((Number(stats.totalPaidAmount) / Number(stats.totalContractAmount)) * 100)
      : 0;
  const paidPart = stats ? Number(stats.totalPaidAmount) : 0;
  const unpaidPart = stats ? Number(stats.totalUnpaidAmount) : 0;
  const totalMoney = paidPart + unpaidPart;
  const paidShare = totalMoney > 0 ? Math.round((paidPart / totalMoney) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-6 py-5">
        {/* 英雄区 */}
        <div className="panel panel-glow relative overflow-hidden px-6 py-5">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(238,125,44,0.16),transparent_65%)]" />
          <div className="relative flex items-center justify-between gap-6">
            <div className="hero-block fade-up min-w-0">
              <div className="flex items-baseline gap-2.5">
                <span className="text-lg font-semibold">
                  {greeting()}
                  {user?.name ? `，${user.name}` : ""}
                </span>
                <span className="text-xs text-faint">{cnDate()}</span>
              </div>
              <div className="mt-3 flex items-end gap-6">
                <div>
                  <div className="label">本期新增合同额</div>
                  <div className="mono text-brandhi num-glow mt-1 text-[40px] font-bold leading-none">
                    <span className="mr-1 align-[6px] text-[22px] font-semibold">¥</span>
                    <CountUp value={Number(stats?.periodContractAmount || 0)} format={(n) => Math.round(n).toLocaleString("zh-CN")} />
                    <span className="ml-1.5 align-[2px] text-[15px] font-medium text-dim">元</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-faint">
                    <span className="rounded-full bg-brand/12 px-2 py-0.5 text-brandhi">
                      <span className="mono">{stats?.periodNewContracts ?? 0}</span> 份合同
                    </span>
                    <span className="rounded-full bg-steel/20 px-2 py-0.5">
                      发货 <span className="mono">{stats?.periodShipments ?? 0}</span>
                    </span>
                    <span className="rounded-full bg-steel/20 px-2 py-0.5">
                      新增客户 <span className="mono">{stats?.periodNewCustomers ?? 0}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="hero-ring fade-up flex items-center gap-6" style={{ animationDelay: "120ms" }}>
              <div className="hidden flex-col gap-2.5 md:flex">
                <div className="min-w-[190px]">
                  <div className="flex justify-between text-xs">
                    <span className="text-dim">已收</span>
                    <span className="mono text-ok">{money(stats?.totalPaidAmount)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-steel/20">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-ok/70 to-ok transition-all duration-1000"
                      style={{ width: `${paidShare}%` }}
                    />
                  </div>
                </div>
                <div className="min-w-[190px]">
                  <div className="flex justify-between text-xs">
                    <span className="text-dim">未收</span>
                    <span className="mono text-warn">{money(stats?.totalUnpaidAmount)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-steel/20">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-warn/60 to-warn transition-all duration-1000"
                      style={{ width: `${100 - paidShare}%` }}
                    />
                  </div>
                </div>
                <div className="text-xs text-faint">
                  累计合同额 <span className="mono text-brandhi">{money(stats?.totalContractAmount)}</span>
                </div>
              </div>
              <Ring pct={paidRate} size={104} label="累计回款率" />
            </div>
          </div>
        </div>

        <PageHeader
          title="工作台"
          sub="按您的数据权限实时统计，与网页端口径一致"
        >
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {user?.role === "SUPER_ADMIN" && (
              <select
                className="input !w-auto !py-1.5"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                aria-label="省份筛选"
              >
                <option value="">全部省份</option>
                {PROVINCE_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            <select
              className="input !w-auto !py-1.5"
              value={salesUserId}
              onChange={(e) => setSalesUserId(e.target.value)}
              aria-label="业务员筛选"
            >
              <option value="">全部业务员</option>
              {(data?.salesUsers || []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <select
              className="input !w-auto !py-1.5"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              aria-label="统计周期"
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {preset === "custom" && (
              <>
                <input
                  className="input !w-auto !py-1.5"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  aria-label="开始日期"
                />
                <input
                  className="input !w-auto !py-1.5"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  aria-label="结束日期"
                />
              </>
            )}
            <select
              className="input !w-auto !py-1.5"
              value={customerStatus}
              onChange={(e) => setCustomerStatus(e.target.value)}
              aria-label="客户状态"
            >
              {CUSTOMER_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="input !w-auto !py-1.5"
              value={contractStatus}
              onChange={(e) => setContractStatus(e.target.value)}
              aria-label="合同状态"
            >
              {CONTRACT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="input !w-auto !py-1.5"
              value={shipmentStatus}
              onChange={(e) => setShipmentStatus(e.target.value)}
              aria-label="发货状态"
            >
              {SHIPMENT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button className="btn-ghost !px-2.5" title="清空维度筛选" onClick={clearDimensionFilters}>
              清空
            </button>
            <button className="btn-ghost !px-2.5" title="刷新" onClick={() => load()}>
              {loading ? <Spinner className="!h-4 !w-4" /> : <RefreshCw size={15} />}
            </button>
          </div>
        </PageHeader>

        {error && <ErrorTip message={error} onRetry={() => load()} />}

        {!error && stats && (
          <>
            <div className="grid grid-cols-4 gap-3">
              <Tile delay={0} label="客户总数" value={stats.totalCustomers} sub={<>本期新增 <span className="mono text-brandhi">{stats.periodNewCustomers}</span></>} href="/customers" />
              <Tile delay={60} label="本期回款" value={stats.periodPaidAmount} glow="text-ok num-glow-ok" format={(n) => moneyFull(n)} sub={`累计回款 ${moneyShort(stats.totalPaidAmount)}`} href={kpiHrefs.periodContractAmount} title="查看本期新建合同（已收合计与本期回款同源）" />
              <Tile delay={120} label="未回款余额" value={stats.totalUnpaidAmount} glow="text-warn num-glow-warn" format={(n) => moneyFull(n)} sub={<>未收 <span className="mono">{stats.unpaidContracts}</span> 笔 · 部分 <span className="mono">{stats.partialPaidContracts}</span> 笔</>} href="/contracts?tab=unpaid" />
              <Tile delay={180} label="今日待跟进" value={stats.todayFollowUp} glow={stats.todayFollowUp > 0 ? "text-brandhi" : ""} sub={`近 7 日待跟进 ${stats.sevenDayFollowUp}`} href="/reminders?group=today" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Tile delay={240} label="逾期未跟进" value={stats.overdueFollowUp} glow={stats.overdueFollowUp > 0 ? "text-bad num-glow-bad" : ""} sub="超过计划跟进日期" href="/reminders?group=overdue" />
              <Tile delay={300} label="今日应发货" value={stats.todayShipmentDue} glow={stats.todayShipmentDue > 0 ? "text-brandhi" : ""} sub={`7 日内应发 ${stats.sevenDayShipmentDue}`} href={SHIPMENT_REMINDER_HREFS.today} />
              <Tile delay={360} label="逾期未发货" value={stats.overdueShipmentDue} glow={stats.overdueShipmentDue > 0 ? "text-bad num-glow-bad" : ""} sub="超过预计发货日期" href={kpiHrefs.overdueShipmentDue} />
              <Tile delay={420} label="累计合同额" value={stats.totalContractAmount} format={(n) => moneyShort(n)} sub={`累计回款 ${moneyShort(stats.totalPaidAmount)}`} href="/contracts" />
            </div>

            {/* 销售目标达成率：独立端点 /api/crm/sales-targets（工作台接口不含目标字段） */}
            {salesTargetReadable && (
              <SalesTargetCard
                salesUsers={data?.salesUsers || []}
                currentUserId={user?.id}
                isSuperAdmin={user?.role === "SUPER_ADMIN"}
                delay={120}
              />
            )}

            {/* 发货提醒：角标是服务端完整计数，列表被服务端 take:8 截断，
                所以固定卡片高度 + 内部滚动，并在底部给「查看全部 →」兜住看不到的条数 */}
            <div className="panel fade-up flex h-[320px] flex-col" style={{ animationDelay: "120ms" }}>
              <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brandhi to-brand" /> 发货提醒
                </div>
                <Segmented
                  options={[
                    { value: "today", label: `今日 ${stats.todayShipmentDue ?? 0}` },
                    { value: "sevenDays", label: `7日内 ${stats.sevenDayShipmentDue ?? 0}` },
                    { value: "overdue", label: `逾期 ${stats.overdueShipmentDue ?? 0}` },
                  ] as const}
                  value={reminderTab}
                  onChange={setReminderTab}
                />
              </div>
              {reminderList.length === 0 ? (
                <Empty text="该时段暂无提醒" />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-1">
                  {reminderList.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className="row-hover flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left"
                      title={`查看合同 ${c.contractNo}`}
                      onClick={() => navigate(`/contracts/${c.id}`)}
                    >
                      <CalendarClock size={14} className="shrink-0 text-faint" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">
                          {c.customer?.companyName || "—"}
                          <span className="text-faint"> · {c.equipmentName || c.equipmentModel}</span>
                        </div>
                        <div className="mono mt-0.5 text-xs text-faint">{c.contractNo}</div>
                      </div>
                      <Pill tone={reminderTab === "overdue" ? "text-bad bg-bad/10" : "text-brandhi bg-brand/10"}>
                        {date(c.estimatedShipmentDate)}
                      </Pill>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 px-4 pb-3 pt-1">
                <span className="text-[11px] text-faint">
                  {reminderHidden > 0 ? `卡片仅展示前 ${reminderList.length} 条，其余 ${reminderHidden} 条在列表页` : ""}
                </span>
                <button
                  type="button"
                  className="text-xs font-medium text-brandhi hover:underline"
                  onClick={() => navigate(SHIPMENT_REMINDER_HREFS[reminderTab])}
                >
                  查看全部 →
                </button>
              </div>
            </div>

            {/* 售后提醒：三组齐全，任一组有数据时整组展示（与平台一致） */}
            {afterSalesHasItems && (
              <div className="grid grid-cols-3 items-stretch gap-3">
                {AFTER_SALES_GROUPS.map((g, i) => (
                  <AfterSalesCard
                    key={g.key}
                    title={g.label}
                    tone={g.tone}
                    items={afterSales?.[g.key] || []}
                    href={AFTER_SALES_REMINDER_HREFS[g.key]}
                    delay={120 + i * 60}
                  />
                ))}
              </div>
            )}

            <div className="grid grid-cols-5 items-start gap-3">
              {/* 最近跟进 */}
              <div className="panel fade-up col-span-3" style={{ animationDelay: "240ms" }}>
                <div className="flex items-center gap-2 px-4 pt-3.5 pb-2 text-sm font-medium">
                  <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brandhi to-brand" />
                  <ClipboardList size={14} className="text-brand" /> 最近跟进
                </div>
                {!data?.recentFollows?.length ? (
                  <Empty text="暂无跟进记录" />
                ) : (
                  <div className="grid grid-cols-2 gap-x-2 px-2 pb-2">
                    {data.recentFollows.map((f) => (
                      <div key={f.id} className="rounded-xl px-2.5 py-2 transition-colors hover:bg-panel2/70">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm">{f.customer?.companyName || "—"}</span>
                          <span className="shrink-0 text-[11px] text-faint">{relativeTime(f.createdAt)}</span>
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-xs text-faint">{f.content}</div>
                        <div className="mt-0.5 text-[11px] text-faint">
                          {FOLLOW_TYPE[f.followType] || f.followType} · {f.user?.name || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 近期待跟进 */}
              <div className="panel fade-up col-span-2" style={{ animationDelay: "300ms" }}>
                <div className="flex items-center gap-2 px-4 pt-3.5 pb-2 text-sm font-medium">
                  <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brandhi to-brand" />
                  <CalendarClock size={14} className="text-brand" /> 近期待跟进
                </div>
                {!data?.followUpCustomers?.length ? (
                  <Empty text="暂无待跟进客户" />
                ) : (
                  <div className="px-2 pb-2">
                    {data.followUpCustomers.map((c) => (
                      <div key={c.id} className="row-hover flex items-center justify-between gap-2 rounded-xl px-2.5 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm">{c.companyName}</div>
                          <div className="text-xs text-faint">{c.contactName}</div>
                        </div>
                        <span className="mono shrink-0 text-xs text-warn">{date(c.nextFollowDate)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
