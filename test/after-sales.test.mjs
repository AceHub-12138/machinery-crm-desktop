import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAfterSalesCreatePayload, canCloseAfterSalesOrder } from "../src/lib/after-sales.ts";

test("已完成工单只有存在签字附件时才可关闭", () => {
  assert.equal(canCloseAfterSalesOrder("COMPLETED", 0), false);
  assert.equal(canCloseAfterSalesOrder("COMPLETED", 1), true);
  assert.equal(canCloseAfterSalesOrder("IN_PROGRESS", 1), false);
});

test("售后建单与平台一致：服务地址选填，有偿服务金额必须显式填写", () => {
  const base = {
    contractId: "contract-1",
    orderType: "NEW_MACHINE_DEBUG",
    urgency: "NORMAL",
    dispatchDate: "2026-09-10",
    serviceAmount: "",
    assigneeNames: " 张工 ",
    serviceAddress: " ",
    description: " 上门调试 ",
    partNames: ["主轴"],
  };
  assert.deepEqual(buildAfterSalesCreatePayload(base), {
    contractId: "contract-1",
    orderType: "NEW_MACHINE_DEBUG",
    urgency: "NORMAL",
    dispatchDate: "2026-09-10",
    assigneeNames: "张工",
    serviceAddress: "",
    description: "上门调试",
    partNames: ["主轴"],
  });
  assert.throws(
    () => buildAfterSalesCreatePayload({ ...base, orderType: "OUT_WARRANTY_PAID" }),
    /必须填写服务金额/,
  );
  assert.equal(buildAfterSalesCreatePayload({ ...base, orderType: "OUT_WARRANTY_PAID", serviceAmount: "0" }).serviceAmount, 0);
});
