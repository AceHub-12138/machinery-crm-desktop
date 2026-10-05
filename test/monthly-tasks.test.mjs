import { test } from "node:test";
import assert from "node:assert/strict";

import { groupMonthlyTasks, normalizeTaskMonth } from "../src/lib/monthly-tasks.ts";

test("月任务按平台规则分为逾期、今日、本周和本月稍后", () => {
  const now = new Date("2026-09-10T12:00:00+08:00");
  const task = (sourceId, date) => ({ sourceType: "TEST", sourceId, module: "CRM", taskType: "TEST", title: sourceId, status: "PENDING", priority: "NORMAL", dueAt: date, createdAt: date, dateField: "dueAt", href: "/tasks" });
  const groups = groupMonthlyTasks([
    task("overdue", "2026-09-09T08:00:00+08:00"),
    task("today", "2026-09-10T20:00:00+08:00"),
    task("week", "2026-09-16T08:00:00+08:00"),
    task("later", "2026-09-17T08:00:00+08:00"),
  ], now);
  assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, items.map((item) => item.sourceId)])), {
    overdue: ["overdue"], today: ["today"], week: ["week"], later: ["later"],
  });
});

test("月任务深链只接受平台支持的 YYYY-MM 月份", () => {
  assert.equal(normalizeTaskMonth("2026-09", new Date("2025-01-01")), "2026-09");
  assert.equal(normalizeTaskMonth("2026-99", new Date("2025-01-01")), "2025-01");
  assert.equal(normalizeTaskMonth("not-a-month", new Date("2025-01-01")), "2025-01");
});
