// 工作台 KPI / 提醒卡片的跳转口径：与平台 modules/crm/dashboard/kpi-linkage.ts 的
// dashboardKpiHrefs() 逐字段一致，这样桌面端点卡片落到筛选后的目标模块时，
// 结果集与卡片上的数字同源（同一时间段、同一维度）。
//
// 平台把 KPI 参数刻意分成两组：
//   kpiSalesUserId —— 工作台联动带过来的业务员（用户没在手选）
//   salesUserId    —— 用户在目标页自己选的业务员
// 目标页读到 kpiSalesUserId 时显示为筛选态但不写回用户选择，避免把用户手选覆盖掉。

export type DashboardPreset =
  | "today"
  | "yesterday"
  | "7d"
  | "month"
  | "lastMonth"
  | "quarter"
  | "year"
  | "custom";

export interface DashboardRange {
  startDate: string;
  endDate: string;
}

export interface DashboardKpiFilters {
  province?: string;
  salesUserId?: string;
  customerStatus?: string;
  contractStatus?: string;
  shipmentStatus?: string;
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

/** 本地日期 → yyyy-MM-dd（不用 toISOString：UTC 偏移会串天） */
export function formatLocalDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addLocalDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** 起始日含、结束日含 → { startDate, endDate }（平台 dashboardRangeDates 的本地等价实现） */
export function dashboardRangeDates(start: Date, endExclusive: Date): DashboardRange {
  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(addLocalDays(endExclusive, -1)),
  };
}

/**
 * 预设 → 日期区间。平台在 /api/dashboard 响应里回传 range.startDate/endDate，
 * 正常走服务端口径（serverRange）；预览模式等拿不到时用本地推算兜底，区间规则与平台 dateRange() 相同。
 */
export function resolveDashboardRange(
  preset: string,
  customStart: string,
  customEnd: string,
  serverRange?: Partial<DashboardRange> | null,
  now: Date = new Date(),
): DashboardRange {
  if (serverRange?.startDate && serverRange?.endDate) {
    return { startDate: serverRange.startDate, endDate: serverRange.endDate };
  }
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let start = new Date(today.getFullYear(), today.getMonth(), 1);
  let end = addLocalDays(today, 1);
  if (preset === "today") {
    start = today;
    end = addLocalDays(today, 1);
  } else if (preset === "yesterday") {
    start = addLocalDays(today, -1);
    end = today;
  } else if (preset === "7d") {
    start = addLocalDays(today, -6);
    end = addLocalDays(today, 1);
  } else if (preset === "lastMonth") {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (preset === "quarter") {
    start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  } else if (preset === "year") {
    start = new Date(today.getFullYear(), 0, 1);
  } else if (preset === "custom") {
    const parsedStart = parseLocalDate(customStart);
    const parsedEnd = parseLocalDate(customEnd);
    if (parsedStart && parsedEnd) {
      start = parsedStart;
      end = addLocalDays(parsedEnd, 1);
    }
  }
  return dashboardRangeDates(start, end);
}

function filterHref(path: string, entries: Array<[string, string | undefined]>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value) searchParams.set(key, value);
  }
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

/** 工作台卡片 → 目标模块筛选链接（逐字段对齐平台 dashboardKpiHrefs） */
export function dashboardKpiHrefs(range: DashboardRange, filters: DashboardKpiFilters = {}) {
  const { startDate, endDate } = range;
  return {
    periodNewCustomers: filterHref("/customers", [
      ["createdStart", startDate],
      ["createdEnd", endDate],
      ["province", filters.province],
      ["kpiSalesUserId", filters.salesUserId],
      ["status", filters.customerStatus],
    ]),
    periodContractAmount: filterHref("/contracts", [
      ["createdStart", startDate],
      ["createdEnd", endDate],
      ["province", filters.province],
      ["kpiSalesUserId", filters.salesUserId],
      ["contractStatus", filters.contractStatus],
    ]),
    periodShipments: filterHref("/shipments", [
      ["dateStart", filters.shipmentStatus === "OVERDUE" ? undefined : startDate],
      ["dateEnd", filters.shipmentStatus === "OVERDUE" ? undefined : endDate],
      ["province", filters.province],
      ["kpiSalesUserId", filters.salesUserId],
      ["contractStatus", filters.contractStatus],
      ["status", filters.shipmentStatus],
    ]),
    overdueShipmentDue: filterHref("/contracts", [
      ["overdueShipment", "1"],
      ["province", filters.province],
      ["kpiSalesUserId", filters.salesUserId],
      ["contractStatus", filters.contractStatus],
    ]),
  };
}

/**
 * 提示卡片的「查看全部 →」目标：口径与平台三张独立卡片一致。
 * 今日/7 日内都是"待发货"，逾期单独一个状态。
 */
export const SHIPMENT_REMINDER_HREFS = {
  today: "/shipments?status=NOT_SHIPPED",
  sevenDays: "/shipments?status=NOT_SHIPPED",
  overdue: "/shipments?status=OVERDUE",
} as const;

/** 售后三组提醒「查看全部 →」目标：平台 /api/after-sales 只认这三个字符串 */
export const AFTER_SALES_REMINDER_HREFS = {
  inProgress: "/after-sales?reminder=in-progress",
  overdue: "/after-sales?reminder=overdue",
  completedUnclosed: "/after-sales?reminder=completed-unclosed",
} as const;
