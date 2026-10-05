// ERP 板块纯逻辑：枚举文案、预警线口径、分类树、BOM 树、单据金额汇总。
// 口径对齐平台 src/lib/inventory-alert.ts、src/lib/bom-items.ts 与各 ERP 页面。

import type { ErpMaterialCategoryRow } from "../types";

export const ERP_STOCK_IN_TYPE: Record<string, { label: string; tone: string }> = {
  PURCHASE: { label: "采购入库", tone: "text-brandhi bg-brand/10" },
  RETURN: { label: "退货入库", tone: "text-warn bg-warn/10" },
  INITIAL: { label: "期初入库", tone: "text-dim bg-steel/25" },
  CHECK_IN: { label: "盘盈入库", tone: "text-ok bg-ok/10" },
  OTHER: { label: "其他", tone: "text-dim bg-steel/25" },
};

export const ERP_STOCK_OUT_TYPE: Record<string, { label: string; tone: string }> = {
  PRODUCTION: { label: "生产领用", tone: "text-brandhi bg-brand/10" },
  CHECK_OUT: { label: "盘亏出库", tone: "text-bad bg-bad/10" },
  OTHER: { label: "其他", tone: "text-dim bg-steel/25" },
};

export const ERP_STOCK_IN_STATUS: Record<string, { label: string; tone: string }> = {
  CONFIRMED: { label: "已确认", tone: "text-ok bg-ok/10" },
  VOIDED: { label: "已作废", tone: "text-bad bg-bad/10" },
};

export const ERP_STOCK_CHECK_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "草稿", tone: "text-dim bg-steel/25" },
  CHECKING: { label: "盘点中", tone: "text-warn bg-warn/10" },
  DONE: { label: "已完成", tone: "text-ok bg-ok/10" },
};

export const ERP_MOVEMENT_TYPE: Record<string, string> = {
  STOCK_IN: "入库",
  STOCK_OUT: "出库",
  CHECK_ADJUST: "盘点调整",
  TRANSFER_IN: "调拨入库",
  TRANSFER_OUT: "调拨出库",
};

export const ERP_MATERIAL_UNITS = ["件", "个", "套", "kg", "米", "升", "箱", "包", "桶"] as const;

/** 整数计量单位：BOM 用量按 1 步进且必须为正整数（与平台 INTEGER_BOM_UNITS 一致） */
export const BOM_INTEGER_UNITS = ["件", "个", "台", "套", "包", "组", "根"] as const;

export function bomUnitStep(unit?: string | null): number {
  return (BOM_INTEGER_UNITS as readonly string[]).includes(unit || "件") ? 1 : 0.01;
}

/* ---------- 预警线口径（平台 inventory-alert.ts 同语义） ---------- */

type ThresholdMaterial = {
  safetyStock?: unknown;
  safetyStockEnabled?: unknown;
  category?: { warningThreshold?: unknown } | null;
};

function positiveFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 物料勾选「启用安全库存」且安全库存 > 0 → 按物料安全库存预警；
 * 否则回退分类预警线；都没有 → 不预警。安全库存为 0 不作为补货线。
 */
export function resolveInventoryWarningThreshold(material: ThresholdMaterial): number | null {
  const materialActive = material.safetyStockEnabled === undefined ? true : Boolean(material.safetyStockEnabled);
  if (materialActive) {
    const safetyStock = positiveFiniteNumber(material.safetyStock);
    if (safetyStock !== null) return safetyStock;
  }
  return positiveFiniteNumber(material.category?.warningThreshold);
}

export function isInventoryBelowWarningThreshold(quantity: unknown, material: ThresholdMaterial): boolean {
  const threshold = resolveInventoryWarningThreshold(material);
  const stock = Number(quantity);
  return threshold !== null && Number.isFinite(stock) && stock <= threshold;
}

/* ---------- 采购与供应（二期） ---------- */

export const ERP_PURCHASE_ORDER_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "草稿", tone: "text-dim bg-steel/25" },
  ORDERED: { label: "已下单", tone: "text-brandhi bg-brand/10" },
  PARTIAL_RECEIVED: { label: "部分到货", tone: "text-warn bg-warn/10" },
  RECEIVED: { label: "已到货", tone: "text-ok bg-ok/10" },
  CANCELLED: { label: "已取消", tone: "text-bad bg-bad/10" },
};

export const ERP_DEMAND_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "草稿", tone: "text-dim bg-steel/25" },
  SUBMITTED: { label: "已提交", tone: "text-dim bg-steel/25" },
  APPROVED: { label: "已审核", tone: "text-ok bg-ok/10" },
  PARTIALLY_CONVERTED: { label: "部分转采购单", tone: "text-warn bg-warn/10" },
  CONVERTED: { label: "已转采购单", tone: "text-ok bg-ok/10" },
  CANCELLED: { label: "已取消", tone: "text-bad bg-bad/10" },
};

export const ERP_DEMAND_SOURCE: Record<string, string> = {
  PRODUCTION_ORDER: "生产工单",
  STOCK_REPLENISHMENT: "备货",
  MONTHLY_PRODUCTION_PLAN: "月度计划/备件预测",
  MANUAL: "手工采购",
};

export const ERP_DELIVERY_RISK: Record<string, { label: string; tone: string }> = {
  NORMAL: { label: "正常", tone: "text-ok bg-ok/10" },
  ATTENTION: { label: "关注", tone: "text-warn bg-warn/10" },
  HIGH_RISK: { label: "高风险", tone: "text-bad bg-bad/10" },
  OVERDUE: { label: "已逾期", tone: "text-bad bg-bad/15" },
};

export const ERP_DELIVERY_STATUS: Record<string, { label: string; tone: string }> = {
  NOT_DELIVERED: { label: "未交货", tone: "text-dim bg-steel/25" },
  PARTIAL_RECEIVED: { label: "部分到货", tone: "text-warn bg-warn/10" },
  FULLY_RECEIVED: { label: "全部到货", tone: "text-ok bg-ok/10" },
  OVERDUE_NOT_RECEIVED: { label: "逾期未到货", tone: "text-bad bg-bad/10" },
  OVERDUE_PARTIAL_RECEIVED: { label: "逾期部分到货", tone: "text-bad bg-bad/10" },
  CLOSED: { label: "已关闭", tone: "text-faint bg-steel/20" },
};

/** 供应商跟进进度（平台 SupplierProgressStatus 枚举，跟进接口强校验） */
export const ERP_SUPPLIER_PROGRESS: Record<string, string> = {
  UNCONFIRMED: "未确认",
  NOT_SCHEDULED: "未排产",
  SCHEDULED: "已排产",
  IN_PRODUCTION: "生产中",
  PENDING_INSPECTION: "待检验",
  COMPLETED: "已完成",
  PENDING_SHIPMENT: "待发货",
  SHIPPED: "已发货",
  PARTIAL_RECEIVED: "部分到货",
  FULLY_RECEIVED: "全部到货",
  DELAYED: "延期",
  PAUSED: "暂停",
};

/** 采购需求剩余可转数量 = 建议采购 − 已转，负数归零 */
export function demandRemaining(demand: { suggestedQuantity?: unknown; convertedQuantity?: unknown } | null | undefined): number {
  if (!demand) return 0;
  return Math.max(Number(demand.suggestedQuantity || 0) - Number(demand.convertedQuantity || 0), 0);
}

/* ---------- 物料分类树 ---------- */

export interface FlatCategory {
  id: string;
  name: string;
  /** 下拉选项展示文本（按层级缩进） */
  label: string;
  level: number;
  warningThreshold?: number | null;
}

export function flattenCategories(categories: ErpMaterialCategoryRow[], depth = 0): FlatCategory[] {
  const out: FlatCategory[] = [];
  for (const cat of categories || []) {
    out.push({
      id: cat.id,
      name: cat.name,
      label: `${"　".repeat(depth)}${cat.name}`,
      level: depth,
      warningThreshold: cat.warningThreshold ?? null,
    });
    if (Array.isArray(cat.children) && cat.children.length) out.push(...flattenCategories(cat.children, depth + 1));
  }
  return out;
}

/* ---------- BOM 树 ---------- */

/** 按父子关系深度优先排序；孤儿子树兜底追加，避免循环引用死循环 */
export function orderTreeItems<T>(items: T[], idOf: (item: T) => string, parentOf: (item: T) => string): T[] {
  const children = new Map<string, T[]>();
  for (const item of items) children.set(parentOf(item), [...(children.get(parentOf(item)) || []), item]);
  const ordered: T[] = [];
  const visited = new Set<string>();
  const visit = (item: T) => {
    const id = idOf(item);
    if (visited.has(id)) return;
    visited.add(id);
    ordered.push(item);
    for (const child of children.get(id) || []) visit(child);
  };
  for (const root of children.get("") || []) visit(root);
  for (const item of items) visit(item);
  return ordered;
}

/** 分类名含「零件包」的物料才能作为虚拟分组挂子物料（与平台 BOM 页一致） */
export function isPackageMaterial(material: { category?: { name?: string | null } | null } | null | undefined): boolean {
  return String(material?.category?.name || "").includes("零件包");
}

/** 节点在树中的深度（根为 0），用于缩进展示 */
export function treeDepthOf<K extends string>(key: K, parentOf: (key: K) => K, hasKey: (key: K) => boolean): number {
  let depth = 0;
  let parent = parentOf(key);
  const seen = new Set<string>();
  while (parent && hasKey(parent) && !seen.has(parent)) {
    seen.add(parent);
    depth += 1;
    parent = parentOf(parent);
  }
  return depth;
}

/** 节点是否可见：祖先全部未折叠才可见 */
export function treeVisible<K extends string>(key: K, parentOf: (key: K) => K, hasKey: (key: K) => boolean, collapsed: ReadonlySet<string>): boolean {
  let parent = parentOf(key);
  const seen = new Set<string>();
  while (parent && hasKey(parent) && !seen.has(parent)) {
    seen.add(parent);
    if (collapsed.has(parent)) return false;
    parent = parentOf(parent);
  }
  return true;
}

/** 收集一个节点的全部后代 key（删除零件包时联动删子项） */
export function collectDescendantKeys<K extends string>(key: K, keys: readonly K[], parentOf: (item: K) => K): K[] {
  const out: K[] = [];
  const walk = (parent: K) => {
    for (const candidate of keys) {
      if (candidate !== parent && parentOf(candidate) === parent) {
        out.push(candidate);
        walk(candidate);
      }
    }
  };
  walk(key);
  return out;
}

/** 入库明细金额小计（单价 × 数量 求和），与平台服务端汇总口径一致 */
export function sumLineAmounts(lines: { quantity?: string | number | null; unitPrice?: string | number | null }[]): number {
  return lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
}

/** 入库作废原因校验：5–500 字（与平台 void 路由一致） */
export function isValidVoidReason(reason: string): boolean {
  const len = reason.trim().length;
  return len >= 5 && len <= 500;
}

/** 打印数据收集：逐页拉全量，超过 maxRows 截断（与平台 collectPrintResults 一致） */
export async function collectPrintRows<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; total?: number }>,
  options: { maxRows?: number; pageSize?: number } = {},
): Promise<{ items: T[]; truncated: boolean }> {
  const maxRows = options.maxRows ?? 1000;
  const pageSize = options.pageSize ?? 100;
  const first = await fetchPage(1, pageSize);
  const total = Number(first.total ?? first.items.length);
  const items = [...first.items];
  const pages = Math.min(Math.ceil(total / pageSize), Math.ceil(maxRows / pageSize));
  for (let p = 2; p <= pages; p += 1) {
    if (items.length >= maxRows) break;
    const next = await fetchPage(p, pageSize);
    items.push(...next.items);
  }
  return { items: items.slice(0, maxRows), truncated: total > maxRows };
}
