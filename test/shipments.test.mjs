// 单元测试：发货进度口径（合同台数 / 已发货 / 待发 / 合同发货状态）。
// 口径对齐平台：PARTIAL_SHIPPED 与 SHIPPED 都算「已发出」（平台所有汇总都这么算）。
import { test } from "node:test";
import assert from "node:assert/strict";

import { contractMachineCount, isShippedStatus, shippedQuantity, shipmentProgress } from "../src/lib/shipments.ts";

test("合同台数只统计主产品明细，选配件不计入", () => {
  const items = [
    { itemType: "MAIN", quantity: 2 },
    { itemType: "MAIN", quantity: 1 },
    { itemType: "OPTIONAL", quantity: 5 },
  ];
  assert.equal(contractMachineCount(items), 3, "选配件数量不能算成机床台数");
});

test("合同没有主产品明细时台数为未知（null），不能算成 0", () => {
  assert.equal(contractMachineCount([]), null);
  assert.equal(contractMachineCount(null), null);
  assert.equal(contractMachineCount([{ itemType: "OPTIONAL", quantity: 4 }]), null);
});

test("部分发货与已发货同等视为已发出", () => {
  assert.equal(isShippedStatus("SHIPPED"), true);
  assert.equal(isShippedStatus("PARTIAL_SHIPPED"), true);
  assert.equal(isShippedStatus("NOT_SHIPPED"), false);
  assert.equal(isShippedStatus(null), false);
  assert.equal(
    shippedQuantity([
      { quantity: 2, shipmentStatus: "SHIPPED" },
      { quantity: 1, shipmentStatus: "PARTIAL_SHIPPED" },
      { quantity: 9, shipmentStatus: "NOT_SHIPPED" },
    ]),
    3,
    "登记了但还没发出的记录不能算已发",
  );
});

test("生产真实案例：合同 4 台 + 一条「部分发货 1 台」→ 已发 1 台、待发 3 台", () => {
  const progress = shipmentProgress({
    items: [{ itemType: "MAIN", quantity: 4 }],
    shipments: [{ id: "s1", quantity: 1, shipmentStatus: "PARTIAL_SHIPPED" }],
  });
  assert.equal(progress.machines, 4);
  assert.equal(progress.shipped, 1, "部分发货的 1 台是实打实发出去的，必须算已发");
  assert.equal(progress.remaining, 3);
  assert.equal(progress.percent, 25);
  assert.equal(progress.status, "PARTIAL_SHIPPED");
  assert.equal(progress.over, false);
});

test("多条记录混合：已发 = SHIPPED + PARTIAL 之和，未发货记录不进已发也不重复计入待发", () => {
  const progress = shipmentProgress({
    items: [{ itemType: "MAIN", quantity: 5 }],
    shipments: [
      { quantity: 2, shipmentStatus: "SHIPPED" },
      { quantity: 1, shipmentStatus: "PARTIAL_SHIPPED" },
      { quantity: 1, shipmentStatus: "NOT_SHIPPED" },
    ],
  });
  assert.equal(progress.shipped, 3);
  assert.equal(progress.remaining, 2, "待发只按 合同台数 − 已发 算，不再加未发货记录");
  assert.equal(progress.status, "PARTIAL_SHIPPED");
});

test("全部发完：状态已发货、待发 0、进度 100%", () => {
  const progress = shipmentProgress({
    items: [{ itemType: "MAIN", quantity: 2 }],
    shipments: [
      { quantity: 1, shipmentStatus: "SHIPPED" },
      { quantity: 1, shipmentStatus: "PARTIAL_SHIPPED" },
    ],
  });
  assert.equal(progress.shipped, 2);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.percent, 100);
  assert.equal(progress.status, "SHIPPED");
});

test("还没发货：状态未发货、待发等于合同台数", () => {
  const progress = shipmentProgress({ items: [{ itemType: "MAIN", quantity: 3 }], shipments: [] });
  assert.equal(progress.shipped, 0);
  assert.equal(progress.remaining, 3);
  assert.equal(progress.percent, 0);
  assert.equal(progress.status, "NOT_SHIPPED");
});

test("已发超过合同台数：待发不为负，进度封顶且给出 over 提示位", () => {
  const progress = shipmentProgress({
    items: [{ itemType: "MAIN", quantity: 2 }],
    shipments: [{ quantity: 3, shipmentStatus: "SHIPPED" }],
  });
  assert.equal(progress.remaining, 0, "数据异常也不能给出负数待发");
  assert.equal(progress.percent, 100);
  assert.equal(progress.over, true);
});

test("合同台数未知：待发与状态都未知，不拿记录数量冒充合同台数", () => {
  const progress = shipmentProgress({
    items: [],
    shipments: [{ quantity: 2, shipmentStatus: "SHIPPED" }],
  });
  assert.equal(progress.machines, null);
  assert.equal(progress.shipped, 2);
  assert.equal(progress.remaining, null);
  assert.equal(progress.percent, null);
  assert.equal(progress.status, null);
  assert.equal(progress.over, false);
});

test("空合同与非法数量不炸：负数/非数字按 0 计", () => {
  assert.deepEqual(shipmentProgress(null), {
    machines: null, shipped: 0, remaining: null, percent: null, status: null, over: false,
  });

  const weird = shipmentProgress({
    items: [{ itemType: "MAIN", quantity: -3 }, { itemType: "MAIN", quantity: "abc" }],
    shipments: [{ quantity: -2, shipmentStatus: "SHIPPED" }],
  });
  assert.equal(weird.machines, 0);
  assert.equal(weird.shipped, 0);
  assert.equal(weird.remaining, 0);
});

test("编辑单条记录时剔除自身后算可发台数（合同 4 台、本单 1 台部分发货 → 剔除后可发 4）", () => {
  const others = [{ id: "s2", quantity: 0, shipmentStatus: "SHIPPED" }];
  const progress = shipmentProgress({
    items: [{ itemType: "MAIN", quantity: 4 }],
    shipments: others,
  });
  assert.equal(progress.remaining, 4, "编辑时不能把这条记录自己的数量算进已发");
});
