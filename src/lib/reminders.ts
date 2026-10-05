// 跟进提醒分组（与平台 /api/dashboard.followUpCustomers 的客户数组契约对应）。
export interface FollowUpCustomer {
  id: string;
  companyName: string;
  contactName?: string;
  nextFollowDate?: string | null;
  assignedUser?: { id?: string; name?: string } | null;
}

export interface ReminderBuckets {
  today: FollowUpCustomer[];
  upcoming: FollowUpCustomer[];
  overdue: FollowUpCustomer[];
}

/**
 * 分组窗口与平台 dashboard 服务的 followUpCustomers 查询契约严格对齐：
 * 平台取 `nextFollowDate <= addDays(localStartOfDay(today), 7)`（lte，含第 7 天 0 点边界）。
 * 因此三桶的并集恰好覆盖 API 返回的全部客户，不重不漏：
 *   - nextFollowDate 早于今天 0 点                       → overdue
 *   - 今天 0 点 <= nextFollowDate < 明天 0 点            → today
 *   - 明天 0 点 <= nextFollowDate <= 今天 + 7 天 0 点    → upcoming（7 天内到期）
 * 早于今天 0 点与第 7 天后（严格大于窗口右界）都不会被 API 返回。
 */
export function groupFollowUpCustomers(customers: unknown, now = new Date()): ReminderBuckets {
  const buckets: ReminderBuckets = { today: [], upcoming: [], overdue: [] };
  if (!Array.isArray(customers)) return buckets;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  // 与平台 addDays(today, 7) 一致：按日历天加 7，落在第 7 天 0 点（闭区间右界）。
  const windowEnd = new Date(startOfToday);
  windowEnd.setDate(windowEnd.getDate() + 7);
  for (const item of customers as FollowUpCustomer[]) {
    if (!item || typeof item.nextFollowDate !== "string") continue;
    const date = new Date(item.nextFollowDate);
    if (Number.isNaN(date.getTime())) continue;
    if (date < startOfToday) buckets.overdue.push(item);
    else if (date < startOfTomorrow) buckets.today.push(item);
    else if (date <= windowEnd) buckets.upcoming.push(item);
  }
  return buckets;
}

/** 逾期天数：按日历天取整且至少 1（nextFollowDate 早于今天），避免"逾期 0 天" */
export function overdueDays(nextFollowDate?: string | null, now = new Date()): number {
  if (!nextFollowDate) return 0;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const date = new Date(nextFollowDate);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(1, Math.round((startOfToday.getTime() - date.getTime()) / 86400000));
}
