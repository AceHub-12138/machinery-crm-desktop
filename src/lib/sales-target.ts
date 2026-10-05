// 销售目标达成率：与平台 modules/crm/sales-targets + app/api/crm/sales-targets 契约一致。
//   GET  /api/crm/sales-targets?periodType=MONTH|YEAR&year=&month=&metric=  → { period, targets[] }
//   POST /api/crm/sales-targets { periodType, periodYear, periodIndex, metric, amount, salesUserId, note }
// 读权限：能进 CRM 工作台的角色（SUPER_ADMIN / SALES / FOREIGN_TRADE）；设置权限：仅 SUPER_ADMIN。
// 注意：工作台 /api/dashboard 的返回体里没有目标字段，目标数据只从这个独立端点出。

export type SalesTargetPeriodType = "MONTH" | "YEAR";
export type SalesTargetMetric = "CONTRACT_AMOUNT" | "PAID_AMOUNT";

export const SALES_TARGET_PERIOD_OPTIONS: readonly { value: SalesTargetPeriodType; label: string }[] = [
  { value: "MONTH", label: "月度" },
  { value: "YEAR", label: "年度" },
];

export const SALES_TARGET_METRIC_OPTIONS: readonly { value: SalesTargetMetric; label: string }[] = [
  { value: "CONTRACT_AMOUNT", label: "合同额" },
  { value: "PAID_AMOUNT", label: "回款额" },
];

/** 年份下拉跨度：当前年 ±5（与平台一致） */
export const SALES_TARGET_YEAR_SPAN = 5;
/** 目标范围：空字符串代表全公司（salesUserId=null） */
export const SALES_TARGET_COMPANY_SCOPE = "";

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export interface SalesTargetItem {
  id: string;
  periodType: SalesTargetPeriodType;
  periodYear: number;
  periodIndex: number;
  metric: SalesTargetMetric;
  /** 平台回传的是 toFixed(2) 字符串 */
  amount: string;
  salesUserId: string | null;
  note?: string | null;
  targetAmount?: string | null;
  actualAmount?: string | null;
  completionRate?: number | null;
  visualRate?: number | null;
  remainingAmount?: string | null;
  exceededAmount?: string | null;
  exceeded?: boolean | null;
  updatedAt?: string;
}

export interface SalesTargetPeriod {
  type: SalesTargetPeriodType;
  year: number;
  index: number;
  label: string;
}

export interface SalesTargetResponse {
  period: SalesTargetPeriod;
  targets: SalesTargetItem[];
}

/** 目标金额校验：平台 parseTargetAmount 同规则（最多两位小数、> 0、≤ 999999999999.99） */
export function normalizeTargetAmount(raw: string): string {
  const value = raw.trim();
  if (!AMOUNT_PATTERN.test(value)) throw new Error("目标金额必须是最多两位小数且不超过 999999999999.99 的数字");
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error("目标金额必须大于 0");
  return num.toFixed(2);
}

export interface SalesTargetFormInput {
  periodType: SalesTargetPeriodType;
  year: number;
  /** 月度 1..12；年度固定 0 */
  month: number;
  metric: SalesTargetMetric;
  scopeUserId: string;
  amount: string;
  note?: string | null;
}

/** 组装 POST /api/crm/sales-targets 请求体；校验不通过抛错（文案与平台一致） */
export function buildSalesTargetPayload(input: SalesTargetFormInput) {
  const periodYear = Math.trunc(Number(input.year));
  if (!Number.isInteger(periodYear) || periodYear < 2020 || periodYear > 2100) {
    throw new Error("年份必须在 2020 到 2100 之间");
  }
  const periodIndex = input.periodType === "YEAR" ? 0 : Math.trunc(Number(input.month));
  if (input.periodType === "MONTH" && (!Number.isInteger(periodIndex) || periodIndex < 1 || periodIndex > 12)) {
    throw new Error("月度目标的月份必须在 1 到 12 之间");
  }
  const metric: SalesTargetMetric = input.metric === "PAID_AMOUNT" ? "PAID_AMOUNT" : "CONTRACT_AMOUNT";
  return {
    periodType: input.periodType === "YEAR" ? ("YEAR" as const) : ("MONTH" as const),
    periodYear,
    periodIndex,
    metric,
    amount: normalizeTargetAmount(input.amount),
    salesUserId: input.scopeUserId || null,
    note: input.note?.trim() || null,
  };
}

/**
 * 选中要展示的目标：
 * SUPER_ADMIN 按"目标范围"精确匹配（全公司 = salesUserId 为 null），匹配不到再退回全公司那条；
 * 普通销售只有自己的目标，永远看自己的。
 */
export function pickSalesTarget(
  targets: SalesTargetItem[] | undefined | null,
  options: { isSuperAdmin: boolean; scopeUserId: string; currentUserId?: string | null },
): SalesTargetItem | null {
  const list = targets || [];
  if (!options.isSuperAdmin) {
    const own = options.currentUserId || options.scopeUserId;
    return list.find((item) => item.salesUserId === own) || null;
  }
  const wanted = options.scopeUserId;
  const matched = list.find((item) => (item.salesUserId || SALES_TARGET_COMPANY_SCOPE) === wanted);
  if (matched) return matched;
  return list.find((item) => item.salesUserId === null) || null;
}

/** 目标展示金额：¥1,000,000.00（与平台 formatMoney 一致） */
export function formatSalesTargetMoney(value: unknown): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "¥0.00";
  return `¥${num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 完成率展示：保留一位小数；无目标（null/NaN）按 0 */
export function salesTargetRate(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

/** 环形进度只能吃 0..100（平台 visualRate 已夹紧，这里再兜一层防坏数据） */
export function salesTargetVisual(value: unknown): number {
  return Math.max(0, Math.min(100, salesTargetRate(value)));
}

export function salesTargetEmptyText(periodType: SalesTargetPeriodType): string {
  return `尚未设置当前范围的${periodType === "MONTH" ? "月度" : "年度"}销售目标`;
}

export function salesTargetActualLabel(metric: SalesTargetMetric): string {
  return metric === "PAID_AMOUNT" ? "实际回款金额" : "实际合同金额";
}

/** 年份选项：当前年 ±5 */
export function salesTargetYears(currentYear: number): number[] {
  const years: number[] = [];
  for (let year = currentYear - SALES_TARGET_YEAR_SPAN; year <= currentYear + SALES_TARGET_YEAR_SPAN; year += 1) years.push(year);
  return years;
}
