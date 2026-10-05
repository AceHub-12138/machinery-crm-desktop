/**
 * 发货进度纯逻辑：回答「合同共几台、已发几台、还剩几台没发」。
 *
 * 口径与平台一致：平台所有汇总都把 PARTIAL_SHIPPED 与 SHIPPED 同等视为「这批已经发出」——
 * 合同列表徽标（contracts/page.tsx）只要有一条 PARTIAL/SHIPPED 就标「已发货」，
 * 合同状态筛选（kpi-linkage.ts）、工作台本期发货 KPI（dashboard/service.ts）、
 * sales-items.ts 的已发货判断也都是两个状态并列。
 *
 * 业务上的话：车间发出 1 台、合同还剩 3 台没发时，登记发货选的就是「部分发货」，
 * 所以「已发货台数」必须把 PARTIAL_SHIPPED 算进来；把部分发货单列成一个数量池，
 * 会得出「已发 0 台、待发 4 台」这种与事实相反的结论。
 * NOT_SHIPPED 的记录表示登记了但还没发出，不计入已发。
 */

export const SHIPPED_STATUSES: readonly string[] = ["SHIPPED", "PARTIAL_SHIPPED"];

export interface ShipmentItemLike {
  itemType?: string | null;
  quantity?: number | null;
}

export interface ShipmentRecordLike {
  id?: string;
  quantity?: number | null;
  shipmentStatus?: string | null;
}

export interface ShipmentProgress {
  /** 合同台数（主产品明细合计）；合同没有主产品明细时为 null，界面显示「—」 */
  machines: number | null;
  /** 已发货台数：状态为 SHIPPED 或 PARTIAL_SHIPPED 的记录数量合计 */
  shipped: number;
  /** 待发台数 = 合同台数 − 已发货（不小于 0）；合同台数未知时为 null */
  remaining: number | null;
  /** 已发货占合同台数百分比（0–100）；合同台数未知或为 0 时为 null */
  percent: number | null;
  /** 合同整体发货状态（按台数派生）：未发货 / 部分发货 / 已发货；台数未知时为 null */
  status: "NOT_SHIPPED" | "PARTIAL_SHIPPED" | "SHIPPED" | null;
  /** 已发台数超过合同台数（录入不一致），界面需要提示核对 */
  over: boolean;
}

export function isShippedStatus(status?: string | null): boolean {
  return !!status && SHIPPED_STATUSES.includes(status);
}

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 合同台数：只统计主产品（MAIN）明细，选配件不计入 */
export function contractMachineCount(items?: ShipmentItemLike[] | null): number | null {
  const mainItems = (items || []).filter((item) => item.itemType === "MAIN");
  if (!mainItems.length) return null;
  return mainItems.reduce((sum, item) => sum + toCount(item.quantity), 0);
}

/** 已发货台数：SHIPPED 与 PARTIAL_SHIPPED 的记录数量合计 */
export function shippedQuantity(shipments?: ShipmentRecordLike[] | null): number {
  return (shipments || []).reduce((sum, item) => (isShippedStatus(item.shipmentStatus) ? sum + toCount(item.quantity) : sum), 0);
}

export function shipmentProgress(contract?: {
  items?: ShipmentItemLike[] | null;
  shipments?: ShipmentRecordLike[] | null;
} | null): ShipmentProgress {
  const machines = contractMachineCount(contract?.items);
  const shipped = shippedQuantity(contract?.shipments);
  const remaining = machines == null ? null : Math.max(0, machines - shipped);
  const percent = machines ? Math.min(100, Math.round((shipped / machines) * 100)) : null;
  let status: ShipmentProgress["status"] = null;
  if (machines != null) {
    status = shipped <= 0 ? "NOT_SHIPPED" : shipped < machines ? "PARTIAL_SHIPPED" : "SHIPPED";
  }
  return { machines, shipped, remaining, percent, status, over: machines != null && shipped > machines };
}
