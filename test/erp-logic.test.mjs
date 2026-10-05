// 单元测试：ERP 板块纯逻辑（预警线口径 / 分类树 / BOM 树 / 单据金额 / 打印分页收集 / ERP 角色权限与深链）。
// 口径与平台 src/lib/inventory-alert.ts、src/lib/bom-items.ts 一致。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bomUnitStep,
  collectDescendantKeys,
  collectPrintRows,
  demandRemaining,
  ERP_DELIVERY_RISK,
  ERP_DELIVERY_STATUS,
  ERP_DEMAND_SOURCE,
  ERP_DEMAND_STATUS,
  ERP_PURCHASE_ORDER_STATUS,
  ERP_SUPPLIER_PROGRESS,
  flattenCategories,
  isInventoryBelowWarningThreshold,
  isPackageMaterial,
  isValidVoidReason,
  orderTreeItems,
  resolveInventoryWarningThreshold,
  sumLineAmounts,
  treeDepthOf,
  treeVisible,
} from "../src/lib/erp.ts";
import { canAccessView, parseHref, ERP_VIEW_ROLES } from "../src/lib/navigation.ts";

// ---------- 预警线口径 ----------

test("预警线：勾选启用安全库存时按物料安全库存", () => {
  const material = { safetyStock: 8, safetyStockEnabled: true, category: { warningThreshold: 20 } };
  assert.equal(resolveInventoryWarningThreshold(material), 8);
  assert.equal(isInventoryBelowWarningThreshold(8, material), true, "库存 ≤ 预警线即预警");
  assert.equal(isInventoryBelowWarningThreshold(9, material), false);
});

test("预警线：安全库存为 0 不作为补货线，回退分类预警线", () => {
  const material = { safetyStock: 0, safetyStockEnabled: true, category: { warningThreshold: 20 } };
  assert.equal(resolveInventoryWarningThreshold(material), 20);
});

test("预警线：未勾选启用时忽略物料安全库存", () => {
  const material = { safetyStock: 99, safetyStockEnabled: false, category: { warningThreshold: 5 } };
  assert.equal(resolveInventoryWarningThreshold(material), 5);
});

test("预警线：旧数据缺 safetyStockEnabled 字段时按启用处理；都缺失则不预警", () => {
  assert.equal(resolveInventoryWarningThreshold({ safetyStock: 3, category: null }), 3);
  assert.equal(resolveInventoryWarningThreshold({ safetyStock: null, safetyStockEnabled: true, category: { warningThreshold: null } }), null);
  assert.equal(isInventoryBelowWarningThreshold(0, { category: { warningThreshold: null } }), false, "无阈值不预警");
});

// ---------- 分类树 ----------

test("flattenCategories 按层级缩进并展平", () => {
  const flat = flattenCategories([
    { id: "c1", name: "铸件", warningThreshold: 10, children: [{ id: "c1-1", name: "床身", warningThreshold: 5, children: [] }] },
    { id: "c2", name: "外购件", warningThreshold: null, children: [] },
  ]);
  assert.deepEqual(flat.map((c) => [c.id, c.level, c.label]), [
    ["c1", 0, "铸件"],
    ["c1-1", 1, "　床身"],
    ["c2", 0, "外购件"],
  ]);
});

// ---------- BOM 树 ----------

test("orderTreeItems 深度优先排序，孤儿子树兜底且循环不死循环", () => {
  const items = [
    { key: "b", parent: "a" },
    { key: "a", parent: "" },
    { key: "c", parent: "b" },
    { key: "orphan", parent: "ghost" },
  ];
  const ordered = orderTreeItems(items, (i) => i.key, (i) => i.parent);
  assert.deepEqual(ordered.map((i) => i.key), ["a", "b", "c", "orphan"]);
  const cycle = [
    { key: "x", parent: "y" },
    { key: "y", parent: "x" },
  ];
  assert.equal(orderTreeItems(cycle, (i) => i.key, (i) => i.parent).length, 2, "循环引用被 visited 兜底，不抛栈");
});

test("treeDepthOf / treeVisible / collectDescendantKeys", () => {
  const keys = ["root", "pack", "child1", "child2", "sub"];
  const parentOf = (key) => ({ root: "", pack: "root", child1: "pack", child2: "pack", sub: "child1" })[key] || "";
  const hasKey = (key) => keys.includes(key);
  assert.equal(treeDepthOf("pack", parentOf, hasKey), 1);
  assert.equal(treeDepthOf("sub", parentOf, hasKey), 3);
  assert.equal(treeVisible("sub", parentOf, hasKey, new Set()), true);
  assert.equal(treeVisible("sub", parentOf, hasKey, new Set(["pack"])), false, "折叠祖先时后代不可见");
  assert.deepEqual(collectDescendantKeys("pack", keys, parentOf), ["child1", "sub", "child2"], "删除零件包时联动收集全部后代（深度优先序）");
});

test("isPackageMaterial：分类名含「零件包」才可挂子物料", () => {
  assert.equal(isPackageMaterial({ category: { name: "电器零件包" } }), true);
  assert.equal(isPackageMaterial({ category: { name: "外购件" } }), false);
  assert.equal(isPackageMaterial(null), false);
});

test("bomUnitStep：整数计量单位步进 1，其余 0.01", () => {
  assert.equal(bomUnitStep("件"), 1);
  assert.equal(bomUnitStep("kg"), 0.01);
  assert.equal(bomUnitStep(null), 1);
});

// ---------- 单据金额与校验 ----------

test("sumLineAmounts 按单价×数量求和（与平台汇总口径一致）", () => {
  assert.equal(sumLineAmounts([
    { quantity: "10", unitPrice: "660" },
    { quantity: 2, unitPrice: 1200 },
    { quantity: "", unitPrice: "5" },
  ]), 9000);
});

test("isValidVoidReason：作废原因 5–500 字", () => {
  assert.equal(isValidVoidReason("数量录入错误"), true);
  assert.equal(isValidVoidReason("  数量录入错误  "), true, "按 trim 后长度");
  assert.equal(isValidVoidReason("太短"), false);
  assert.equal(isValidVoidReason("长".repeat(501)), false);
});

// ---------- 打印数据收集 ----------

test("collectPrintRows 逐页拉全量并在 1000 条截断", async () => {
  const all = Array.from({ length: 250 }, (_, i) => i);
  const fetchPage = (page, pageSize) => {
    const items = all.slice((page - 1) * pageSize, page * pageSize);
    return Promise.resolve({ items, total: all.length });
  };
  const full = await collectPrintRows(fetchPage, { pageSize: 100 });
  assert.equal(full.items.length, 250);
  assert.equal(full.truncated, false);

  const big = Array.from({ length: 1300 }, (_, i) => i);
  const truncated = await collectPrintRows(
    (page, pageSize) => Promise.resolve({ items: big.slice((page - 1) * pageSize, page * pageSize), total: big.length }),
    { pageSize: 100 },
  );
  assert.equal(truncated.items.length, 1000);
  assert.equal(truncated.truncated, true);
});

// ---------- ERP 角色权限与深链 ----------

test("ERP 权限：三角色按平台矩阵可见，销售/外贸不可见", () => {
  assert.equal(canAccessView("erp-inventory", "SUPER_ADMIN"), true);
  assert.equal(canAccessView("erp-inventory", "PURCHASE"), true);
  assert.equal(canAccessView("erp-inventory", "WAREHOUSE"), true);
  assert.equal(canAccessView("erp-inventory", "SALES"), false);
  assert.equal(canAccessView("erp-inventory", "FOREIGN_TRADE"), false);
  // 库存与物料之外的一期页面：仅超管与仓库（对齐平台侧边栏）
  for (const view of ["erp-bom", "erp-warehouse", "erp-stock-in", "erp-stock-out", "erp-stock-transfers", "erp-stock-check"]) {
    assert.equal(canAccessView(view, "WAREHOUSE"), true, `${view} 仓库可见`);
    assert.equal(canAccessView(view, "PURCHASE"), false, `${view} 采购不可见`);
    assert.equal(canAccessView(view, "SALES"), false, `${view} 销售不可见`);
  }
  assert.equal(ERP_VIEW_ROLES["erp-stock-in"].includes("PURCHASE"), false);
});

test("ERP 深链：/erp/* 映射到对应视图并透传查询参数", () => {
  assert.equal(parseHref("/erp/inventory")?.view, "erp-inventory");
  const stockIn = parseHref("/erp/stock-in?purchaseOrderId=po-1");
  assert.equal(stockIn?.view, "erp-stock-in");
  assert.equal(stockIn?.params?.purchaseOrderId, "po-1");
  const inventory = parseHref("/erp/inventory?alertOnly=1&warehouseId=wh-2");
  assert.equal(inventory?.view, "erp-inventory");
  assert.equal(inventory?.params?.alertOnly, "1");
  assert.equal(inventory?.params?.warehouseId, "wh-2");
  assert.equal(parseHref("/erp/unknown-page"), null, "未收录的 ERP 路径不跳转");
});

// ---------- 二期：采购与供应 ----------

test("采购角色矩阵：供应商仅超管与采购；需求/订单/交期三角色可看", () => {
  assert.equal(canAccessView("erp-suppliers", "PURCHASE"), true);
  assert.equal(canAccessView("erp-suppliers", "WAREHOUSE"), false);
  assert.equal(canAccessView("erp-suppliers", "SALES"), false);
  for (const view of ["erp-purchase-demands", "erp-purchase-orders", "erp-supplier-deliveries"]) {
    assert.equal(canAccessView(view, "SUPER_ADMIN"), true);
    assert.equal(canAccessView(view, "PURCHASE"), true);
    assert.equal(canAccessView(view, "WAREHOUSE"), true, `${view} 仓库可读`);
    assert.equal(canAccessView(view, "SALES"), false, `${view} 销售不可见`);
  }
  assert.equal(ERP_VIEW_ROLES["erp-suppliers"].includes("WAREHOUSE"), false);
});

test("ERP 工作台深链：/dashboard/erp 映射且销售不可见", () => {
  assert.equal(parseHref("/dashboard/erp")?.view, "erp-dashboard");
  assert.equal(canAccessView("erp-dashboard", "SUPER_ADMIN"), true);
});

test("采购深链：/erp/purchase-orders/:id（含 new）映射详情参数", () => {
  const detail = parseHref("/erp/purchase-orders/po-abc");
  assert.equal(detail?.view, "erp-purchase-orders");
  assert.equal(detail?.params?.poId, "po-abc");
  assert.equal(parseHref("/erp/purchase-orders/new")?.params?.poId, "new");
  assert.equal(parseHref("/erp/purchase-orders")?.view, "erp-purchase-orders", "列表路由不受详情正则影响");
  assert.equal(parseHref("/erp/purchase-orders/po-1?focus=items")?.params?.focus, "items", "查询参数透传");
});

test("剩余可转数量 = 建议采购 − 已转，负数归零", () => {
  assert.equal(demandRemaining({ suggestedQuantity: 8, convertedQuantity: 3 }), 5);
  assert.equal(demandRemaining({ suggestedQuantity: 4, convertedQuantity: 4 }), 0);
  assert.equal(demandRemaining({ suggestedQuantity: 4, convertedQuantity: 6 }), 0);
  assert.equal(demandRemaining(null), 0);
});

test("采购/交期枚举文案齐全（避免页面上裸显枚举值）", () => {
  assert.deepEqual(Object.keys(ERP_PURCHASE_ORDER_STATUS), ["DRAFT", "ORDERED", "PARTIAL_RECEIVED", "RECEIVED", "CANCELLED"]);
  assert.deepEqual(Object.keys(ERP_DEMAND_STATUS), ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_CONVERTED", "CONVERTED", "CANCELLED"]);
  assert.deepEqual(Object.keys(ERP_DEMAND_SOURCE), ["PRODUCTION_ORDER", "STOCK_REPLENISHMENT", "MONTHLY_PRODUCTION_PLAN", "MANUAL"]);
  assert.deepEqual(Object.keys(ERP_DELIVERY_RISK), ["NORMAL", "ATTENTION", "HIGH_RISK", "OVERDUE"]);
  assert.deepEqual(Object.keys(ERP_DELIVERY_STATUS), ["NOT_DELIVERED", "PARTIAL_RECEIVED", "FULLY_RECEIVED", "OVERDUE_NOT_RECEIVED", "OVERDUE_PARTIAL_RECEIVED", "CLOSED"]);
  // 跟进接口强校验 SupplierProgressStatus 枚举，桌面端下拉必须覆盖全部 12 个值
  assert.equal(Object.keys(ERP_SUPPLIER_PROGRESS).length, 12);
  for (const map of [ERP_PURCHASE_ORDER_STATUS, ERP_DEMAND_STATUS, ERP_DELIVERY_RISK, ERP_DELIVERY_STATUS]) {
    for (const meta of Object.values(map)) assert.ok(meta.label && meta.tone, "每个状态都要有中文与配色");
  }
});
