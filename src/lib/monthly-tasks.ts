export interface MonthlyTask {
  sourceType: string;
  sourceId: string;
  module: "CRM" | "ERP" | "SYSTEM";
  taskType: string;
  title: string;
  status: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueAt?: string;
  createdAt: string;
  dateField: "dueAt" | "createdAt";
  href: string;
}

export type MonthlyTaskGroup = "overdue" | "today" | "week" | "later";

export const MONTHLY_TASK_GROUP_LABELS: Record<MonthlyTaskGroup, string> = {
  overdue: "已逾期",
  today: "今日",
  week: "本周",
  later: "本月稍后",
};

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function groupMonthlyTasks(items: MonthlyTask[], now = new Date()) {
  const groups: Record<MonthlyTaskGroup, MonthlyTask[]> = { overdue: [], today: [], week: [], later: [] };
  const today = startOfDay(now);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 6);
  for (const item of items) {
    const itemDate = startOfDay(new Date(item.dueAt || item.createdAt));
    const group = itemDate < today ? "overdue" : itemDate.getTime() === today.getTime() ? "today" : itemDate <= weekEnd ? "week" : "later";
    groups[group].push(item);
  }
  return groups;
}

export function formatTaskMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function normalizeTaskMonth(value: string | undefined, now = new Date()) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "") ? value! : formatTaskMonth(now);
}

export function shiftTaskMonth(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  return formatTaskMonth(new Date(year, value - 1 + offset, 1));
}
