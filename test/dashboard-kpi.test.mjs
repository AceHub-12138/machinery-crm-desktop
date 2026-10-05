import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AFTER_SALES_REMINDER_HREFS,
  SHIPMENT_REMINDER_HREFS,
  dashboardKpiHrefs,
  dashboardRangeDates,
  parseLocalDate,
  resolveDashboardRange,
} from "../src/lib/dashboard-kpi.ts";

// ---------- 预设 → 日期区间（口径与平台 modules/crm/dashboard/service.ts dateRange() 一致） ----------

test("预设区间：与平台 dateRange() 同口径（本地日界，结束日含当天）", () => {
  const now = new Date("2026-08-15T10:30:00");
  const cases = [
    ["today", "2026-08-15", "2026-08-15"],
    ["yesterday", "2026-08-14", "2026-08-14"],
    ["7d", "2026-08-09", "2026-08-15"],
    ["month", "2026-08-01", "2026-08-15"],
    ["lastMonth", "2026-07-01", "2026-07-31"],
    ["quarter", "2026-07-01", "2026-08-15"],
    ["year", "2026-01-01", "2026-08-15"],
  ];
  for (const [preset, startDate, endDate] of cases) {
    assert.deepEqual(
      resolveDashboardRange(preset, "", "", null, now),
      { startDate, endDate },
      `${preset} 区间应落在 ${startDate} ~ ${endDate}`,
    );
  }
});

test("自定义区间：起始含、结束含；日期非法时退回本月", () => {
  const now = new Date("2026-08-15T10:30:00");
  assert.deepEqual(resolveDashboardRange("custom", "2026-03-01", "2026-03-31", null, now), {
    startDate: "2026-03-01",
    endDate: "2026-03-31",
  });
  // 只填一半 / 非法日期 → 平台会忽略自定义，退回默认本月区间
  assert.deepEqual(resolveDashboardRange("custom", "2026-03-01", "", null, now), {
    startDate: "2026-08-01",
    endDate: "2026-08-15",
  });
  assert.deepEqual(resolveDashboardRange("custom", "2026-02-30", "2026-03-31", null, now), {
    startDate: "2026-08-01",
    endDate: "2026-08-15",
  });
});

test("服务端回传 range 优先：桌面端不与服务端口径抢解释权", () => {
  const now = new Date("2026-08-15T10:30:00");
  assert.deepEqual(
    resolveDashboardRange("month", "", "", { startDate: "2026-08-01", endDate: "2026-08-14" }, now),
    { startDate: "2026-08-01", endDate: "2026-08-14" },
  );
  // 预览模式 range 为 {} → 走本地兜底
  assert.deepEqual(resolveDashboardRange("month", "", "", {}, now), {
    startDate: "2026-08-01",
    endDate: "2026-08-15",
  });
});

test("dashboardRangeDates：结束日按含当天回推一天", () => {
  assert.deepEqual(dashboardRangeDates(new Date(2026, 7, 1), new Date(2026, 8, 1)), {
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  });
});

test("parseLocalDate 拒绝不存在的日期与畸形串", () => {
  assert.equal(parseLocalDate("2026-02-30"), null);
  assert.equal(parseLocalDate("2026-13-01"), null);
  assert.equal(parseLocalDate("2026/08/01"), null);
  assert.equal(parseLocalDate(""), null);
  assert.equal(parseLocalDate("2026-02-28")?.getDate(), 28);
});

// ---------- KPI 卡片 → 目标模块筛选链接 ----------

const RANGE = { startDate: "2026-08-01", endDate: "2026-08-31" };

test("KPI 链接：维度为空时不带空参数，避免目标页出现空筛选态", () => {
  const hrefs = dashboardKpiHrefs(RANGE);
  assert.equal(hrefs.periodNewCustomers, "/customers?createdStart=2026-08-01&createdEnd=2026-08-31");
  assert.equal(hrefs.periodContractAmount, "/contracts?createdStart=2026-08-01&createdEnd=2026-08-31");
  assert.equal(hrefs.periodShipments, "/shipments?dateStart=2026-08-01&dateEnd=2026-08-31");
  assert.equal(hrefs.overdueShipmentDue, "/contracts?overdueShipment=1");
});

test("KPI 链接：业务员走 kpiSalesUserId，与目标页用户手选的 salesUserId 区分开", () => {
  const hrefs = dashboardKpiHrefs(RANGE, { salesUserId: "u-1", province: "山东省", customerStatus: "QUOTED" });
  const customers = new URL(hrefs.periodNewCustomers, "https://x.invalid");
  assert.equal(customers.searchParams.get("kpiSalesUserId"), "u-1");
  assert.equal(customers.searchParams.get("salesUserId"), null, "工作台联动不得写成用户手选参数");
  assert.equal(customers.searchParams.get("province"), "山东省");
  assert.equal(customers.searchParams.get("status"), "QUOTED", "客户页的状态参数名是 status");
});

test("KPI 链接：发货状态为逾期时按平台规则丢掉日期区间", () => {
  const normal = dashboardKpiHrefs(RANGE, { shipmentStatus: "NOT_SHIPPED" }).periodShipments;
  assert.equal(new URL(normal, "https://x.invalid").searchParams.get("dateStart"), "2026-08-01");
  assert.equal(new URL(normal, "https://x.invalid").searchParams.get("status"), "NOT_SHIPPED");

  const overdue = dashboardKpiHrefs(RANGE, { shipmentStatus: "OVERDUE" }).periodShipments;
  const overdueUrl = new URL(overdue, "https://x.invalid");
  assert.equal(overdueUrl.searchParams.get("dateStart"), null, "逾期口径由 status 决定，不带日期区间");
  assert.equal(overdueUrl.searchParams.get("dateEnd"), null);
  assert.equal(overdueUrl.searchParams.get("status"), "OVERDUE");
});

test("KPI 链接：合同状态筛选透传到合同页与发货页", () => {
  const hrefs = dashboardKpiHrefs(RANGE, { contractStatus: "SIGNED" });
  assert.equal(new URL(hrefs.periodContractAmount, "https://x.invalid").searchParams.get("contractStatus"), "SIGNED");
  assert.equal(new URL(hrefs.periodShipments, "https://x.invalid").searchParams.get("contractStatus"), "SIGNED");
  assert.equal(new URL(hrefs.overdueShipmentDue, "https://x.invalid").searchParams.get("contractStatus"), "SIGNED");
});

test("提醒卡片「查看全部」目标：与平台三张独立卡片一致", () => {
  assert.equal(SHIPMENT_REMINDER_HREFS.today, "/shipments?status=NOT_SHIPPED");
  assert.equal(SHIPMENT_REMINDER_HREFS.sevenDays, "/shipments?status=NOT_SHIPPED");
  assert.equal(SHIPMENT_REMINDER_HREFS.overdue, "/shipments?status=OVERDUE");
  // 平台 /api/after-sales 只认这三个字符串：in-progress / overdue / completed-unclosed
  assert.deepEqual(Object.values(AFTER_SALES_REMINDER_HREFS), [
    "/after-sales?reminder=in-progress",
    "/after-sales?reminder=overdue",
    "/after-sales?reminder=completed-unclosed",
  ]);
});
