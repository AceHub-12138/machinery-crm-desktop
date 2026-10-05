import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SALES_TARGET_COMPANY_SCOPE,
  buildSalesTargetPayload,
  formatSalesTargetMoney,
  normalizeTargetAmount,
  pickSalesTarget,
  salesTargetActualLabel,
  salesTargetEmptyText,
  salesTargetRate,
  salesTargetVisual,
  salesTargetYears,
} from "../src/lib/sales-target.ts";

// ---------- 目标金额校验（对齐平台 parseTargetAmount） ----------

test("目标金额：最多两位小数、必须大于 0，保存前统一成两位小数字符串", () => {
  assert.equal(normalizeTargetAmount("1000000"), "1000000.00");
  assert.equal(normalizeTargetAmount(" 1250.5 "), "1250.50");
  assert.equal(normalizeTargetAmount("0.01"), "0.01");

  assert.throws(() => normalizeTargetAmount("0"), /必须大于 0/);
  assert.throws(() => normalizeTargetAmount(""), /最多两位小数/);
  assert.throws(() => normalizeTargetAmount("1.234"), /最多两位小数/);
  assert.throws(() => normalizeTargetAmount("-5"), /最多两位小数/);
  assert.throws(() => normalizeTargetAmount("1e6"), /最多两位小数/);
  assert.throws(() => normalizeTargetAmount("01"), /最多两位小数/, "前导零不符合平台正则");
  assert.throws(() => normalizeTargetAmount("9999999999999"), /最多两位小数/, "超过 12 位整数位");
});

// ---------- POST 请求体 ----------

test("目标请求体：月度带 1..12 的 periodIndex，年度固定 0", () => {
  assert.deepEqual(
    buildSalesTargetPayload({
      periodType: "MONTH",
      year: 2026,
      month: 9,
      metric: "CONTRACT_AMOUNT",
      scopeUserId: SALES_TARGET_COMPANY_SCOPE,
      amount: "3000000",
      note: "  月目标  ",
    }),
    {
      periodType: "MONTH",
      periodYear: 2026,
      periodIndex: 9,
      metric: "CONTRACT_AMOUNT",
      amount: "3000000.00",
      salesUserId: null,
      note: "月目标",
    },
  );

  const yearly = buildSalesTargetPayload({
    periodType: "YEAR",
    year: 2026,
    month: 9,
    metric: "PAID_AMOUNT",
    scopeUserId: "u-2",
    amount: "100.00",
  });
  assert.equal(yearly.periodIndex, 0, "年度目标 periodIndex 必须为 0，月份不参与");
  assert.equal(yearly.salesUserId, "u-2");
  assert.equal(yearly.note, null);
});

test("目标请求体：年份与月份越界按平台文案报错", () => {
  const base = { periodType: "MONTH", year: 2026, month: 9, metric: "CONTRACT_AMOUNT", scopeUserId: "", amount: "1" };
  assert.throws(() => buildSalesTargetPayload({ ...base, year: 2019 }), /2020 到 2100/);
  assert.throws(() => buildSalesTargetPayload({ ...base, year: 2101 }), /2020 到 2100/);
  assert.throws(() => buildSalesTargetPayload({ ...base, month: 0 }), /1 到 12/);
  assert.throws(() => buildSalesTargetPayload({ ...base, month: 13 }), /1 到 12/);
  assert.throws(() => buildSalesTargetPayload({ ...base, amount: "0" }), /必须大于 0/);
});

// ---------- 目标选中 ----------

const targets = [
  { id: "company", periodType: "MONTH", periodYear: 2026, periodIndex: 9, metric: "CONTRACT_AMOUNT", amount: "3000000.00", salesUserId: null, actualAmount: "685000.00", visualRate: 22.8, completionRate: 22.8 },
  { id: "mine", periodType: "MONTH", periodYear: 2026, periodIndex: 9, metric: "CONTRACT_AMOUNT", amount: "500000.00", salesUserId: "u-1", actualAmount: "120000.00", visualRate: 24, completionRate: 24 },
];

test("目标选中：超管按范围匹配，全公司命中 salesUserId 为 null 的那条", () => {
  assert.equal(pickSalesTarget(targets, { isSuperAdmin: true, scopeUserId: "", currentUserId: "u-9" })?.id, "company");
  assert.equal(pickSalesTarget(targets, { isSuperAdmin: true, scopeUserId: "u-1", currentUserId: "u-9" })?.id, "mine");
  assert.equal(
    pickSalesTarget(targets, { isSuperAdmin: true, scopeUserId: "u-404", currentUserId: "u-9" })?.id,
    "company",
    "指定销售没有目标时退回全公司，而不是空白",
  );
});

test("目标选中：普通销售永远只读自己的目标，越权范围被忽略", () => {
  assert.equal(pickSalesTarget(targets, { isSuperAdmin: false, scopeUserId: "", currentUserId: "u-1" })?.id, "mine");
  assert.equal(
    pickSalesTarget(targets, { isSuperAdmin: false, scopeUserId: "u-1", currentUserId: "u-2" }),
    null,
    "没有自己的目标就是没配置，不能拿别人的顶上",
  );
  assert.equal(pickSalesTarget(null, { isSuperAdmin: false, scopeUserId: "", currentUserId: "u-1" }), null);
});

// ---------- 展示辅助 ----------

test("金额与完成率展示：坏数据不渲染成 NaN", () => {
  assert.equal(formatSalesTargetMoney("685000"), "¥685,000.00");
  assert.equal(formatSalesTargetMoney(null), "¥0.00");
  assert.equal(formatSalesTargetMoney("abc"), "¥0.00");
  assert.equal(salesTargetRate(22.84), 22.84);
  assert.equal(salesTargetRate(null), 0);
  assert.equal(salesTargetVisual(180), 100, "环形进度夹在 0..100，超额由金额表达");
  assert.equal(salesTargetVisual(-5), 0);
  assert.equal(salesTargetVisual(undefined), 0);
});

test("文案：周期空态与指标名对齐平台", () => {
  assert.equal(salesTargetEmptyText("MONTH"), "尚未设置当前范围的月度销售目标");
  assert.equal(salesTargetEmptyText("YEAR"), "尚未设置当前范围的年度销售目标");
  assert.equal(salesTargetActualLabel("CONTRACT_AMOUNT"), "实际合同金额");
  assert.equal(salesTargetActualLabel("PAID_AMOUNT"), "实际回款金额");
});

test("年份选项：当前年 ±5 共 11 项且升序", () => {
  const years = salesTargetYears(2026);
  assert.equal(years.length, 11);
  assert.equal(years[0], 2021);
  assert.equal(years[10], 2031);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
});
